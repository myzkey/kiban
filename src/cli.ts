#!/usr/bin/env node
import fs from "fs-extra";
import { spawn } from "node:child_process";
import { Command } from "commander";
import open from "open";
import { execa } from "execa";
import {
  findConfig,
  findProject,
  findProxyConfig,
  findProxyProject,
  findProxyService,
  loadConfig,
  loadProxyConfig,
  saveConfig,
  writeInitialProxyConfig
} from "./config.js";
import { containerName, downService, isDockerRunning, serviceRunning, upService } from "./docker.js";
import { runDoctor } from "./doctor.js";
import { waitForHealth } from "./health.js";
import { projectLogPath } from "./paths.js";
import { getPortUsage, listListeningPorts } from "./ports.js";
import { proxyUrl, startProxy, targetPort } from "./proxy.js";
import { getProjectStatus } from "./runtime.js";
import { startProject, stopProject } from "./runtime.js";
import { printJson, error as printError, ok, warn } from "./output.js";
import type { KibanConfig } from "./types.js";

const program = new Command();

program
  .name("kiban")
  .description("An AI-friendly local development stack manager.")
  .version("0.1.0");

program
  .command("init")
  .description("Create kiban.config.json in the current directory.")
  .action(async () => {
    const configPath = await writeInitialProxyConfig();
    ok(`Created ${configPath}`);
  });

program
  .command("add")
  .argument("<name>")
  .option("--path <path>")
  .option("--cmd <command>")
  .option("--port <port>")
  .option("--url <url>")
  .option("--service <name...>")
  .option("--editor <command>")
  .description("Add a project to kiban.yml. Non-interactive options are supported.")
  .action(async (name, options) => {
    const { path, config } = await loadConfig();
    if (!options.path || !options.cmd) {
      throw new Error("Non-interactive add requires --path and --cmd.");
    }
    const next: KibanConfig = {
      ...config,
      projects: [
        ...config.projects.filter((project) => project.name !== name),
        {
          name,
          path: options.path,
          command: options.cmd,
          port: options.port ? Number(options.port) : undefined,
          url: options.url,
          services: options.service ?? [],
          editor: options.editor
        }
      ]
    };
    await saveConfig(path, next);
    ok(`Added project ${name}`);
  });

program
  .command("list")
  .option("--json", "Print JSON.")
  .description("List registered projects.")
  .action(async (options) => {
    if (await findProxyConfig()) {
      const { config } = await loadProxyConfig();
      const rows = config.projects.map((project) => ({
        name: project.name,
        host: proxyUrl(config, project.host),
        target: project.target,
        command: project.command,
        cwd: project.cwd,
        services: project.services ?? []
      }));
      if (options.json) return printJson({ workspace: config.workspace, proxyPort: config.proxyPort, services: config.services, projects: rows });
      for (const row of rows) {
        console.log(`${row.name}`);
        console.log(`  host: ${row.host}`);
        console.log(`  target: ${row.target}`);
        console.log(`  command: ${row.command}`);
        if (row.services.length > 0) console.log(`  services: ${row.services.join(", ")}`);
      }
      return;
    }

    const { config } = await loadConfig();
    const rows = await Promise.all(
      config.projects.map(async (project) => ({
        name: project.name,
        ...(await getProjectStatus(project)),
        port: project.port,
        url: project.url,
        services: project.services ?? []
      }))
    );
    if (options.json) return printJson({ projects: rows });
    for (const row of rows) console.log(`${row.name}\t${row.status}\t${row.port ?? "-"}\t${row.url ?? "-"}\t${row.services.join(",")}`);
  });

program
  .command("dev")
  .description("Run all commands from kiban.config.json and stream their output.")
  .action(async () => {
    const { config } = await loadProxyConfig();
    if (config.projects.length === 0) throw new Error("No projects configured in kiban.config.json.");

    await startProjectServices(config);

    for (const project of config.projects) {
      const port = targetPort(project.target);
      if (port) await assertPortAvailableForDev(port, project.name);
    }

    const children = config.projects.map((project) => {
      ok(`Starting ${project.name}: ${project.command}`);
      const child = spawn(project.command, {
        cwd: project.cwd,
        shell: true,
        env: process.env
      });

      child.stdout?.on("data", (chunk: Buffer) => {
        process.stdout.write(prefixLines(project.name, chunk));
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        process.stderr.write(prefixLines(project.name, chunk));
      });
      child.on("exit", (code, signal) => {
        warn(`${project.name} exited${code === null ? "" : ` with code ${code}`}${signal ? ` (${signal})` : ""}`);
      });
      return child;
    });

    const stopChildren = () => {
      for (const child of children) {
        if (!child.killed) child.kill("SIGTERM");
      }
    };
    process.once("SIGINT", () => {
      stopChildren();
      process.exit(130);
    });
    process.once("SIGTERM", () => {
      stopChildren();
      process.exit(143);
    });

    await new Promise<void>((resolve) => {
      let exited = 0;
      for (const child of children) {
        child.on("exit", () => {
          exited += 1;
          if (exited === children.length) resolve();
        });
      }
    });
  });

const servicesCommand = program
  .command("services")
  .description("Manage Docker services from kiban.config.json.");

servicesCommand
  .command("up")
  .argument("[services...]")
  .description("Start Docker services from kiban.config.json.")
  .action(async (names: string[]) => {
    const { config } = await loadProxyConfig();
    const targets = names.length > 0 ? names : config.services.map((service) => service.name);
    if (targets.length === 0) throw new Error("No services configured in kiban.config.json.");
    await startNamedServices(config, targets);
  });

servicesCommand
  .command("down")
  .argument("[services...]")
  .description("Stop Docker services from kiban.config.json.")
  .action(async (names: string[]) => {
    const { config } = await loadProxyConfig();
    const targets = names.length > 0 ? names : config.services.map((service) => service.name);
    if (targets.length === 0) throw new Error("No services configured in kiban.config.json.");
    for (const name of targets) {
      const service = findProxyService(config, name);
      await downService(config, service);
      ok(`Stopped service ${service.name}`);
    }
  });

servicesCommand
  .command("status")
  .option("--json", "Print JSON.")
  .description("Show Docker service status from kiban.config.json.")
  .action(async (options) => {
    const { config } = await loadProxyConfig();
    const rows = await Promise.all(
      config.services.map(async (service) => ({
        name: service.name,
        image: service.image,
        container: containerName(config, service),
        running: await serviceRunning(config, service),
        ports: service.ports ?? []
      }))
    );
    if (options.json) return printJson({ services: rows });
    for (const row of rows) {
      console.log(`${row.name}\t${row.running ? "running" : "stopped"}\t${row.container}\t${row.ports.join(",")}`);
    }
  });

program
  .command("up")
  .argument("[projects...]")
  .option("--all", "Start all projects.")
  .option("-d, --detach", "Start projects in the background without following logs.")
  .option("--follow", "Follow project logs after starting. This is the default unless --detach is used.")
  .description("Start projects and their dependent services.")
  .action(async (names: string[], options) => {
    const { config } = await loadConfig();
    const targets = options.all ? config.projects : names.map((name) => findProject(config, name));
    if (targets.length === 0) throw new Error("Specify a project name or --all.");
    const logFiles: string[] = [];
    const logOffsets = new Map<string, number>();
    for (const project of targets) {
      const logFile = project.logFile ?? projectLogPath(project.name);
      logOffsets.set(logFile, await fileSize(logFile));
      const result = await startProject(config, project);
      ok(`${project.name} ${result.alreadyRunning ? "already running" : "started"}${result.pid ? ` (pid ${result.pid})` : ""}`);
      logFiles.push(result.logFile ?? logFile);
    }
    if (!options.detach || options.follow) await followLogs(logFiles, logOffsets);
  });

program
  .command("down")
  .argument("<projects...>")
  .option("--with-services", "Stop dependent Docker services too.")
  .description("Stop projects.")
  .action(async (names: string[], options) => {
    const { config } = await loadConfig();
    for (const name of names) {
      const result = await stopProject(config, findProject(config, name), Boolean(options.withServices));
      ok(`${name} stopped${result.pid ? ` (pid ${result.pid})` : ""}`);
    }
  });

program
  .command("restart")
  .argument("<projects...>")
  .description("Restart projects.")
  .action(async (names: string[]) => {
    const { config } = await loadConfig();
    for (const name of names) {
      const project = findProject(config, name);
      await stopProject(config, project);
      const result = await startProject(config, project);
      ok(`${name} restarted (pid ${result.pid})`);
    }
  });

program
  .command("status")
  .option("--json", "Print JSON.")
  .description("Show project status.")
  .action(async (options) => {
    const { config } = await loadConfig();
    const projects = await Promise.all(
      config.projects.map(async (project) => ({
        name: project.name,
        ...(await getProjectStatus(project)),
        port: project.port,
        url: project.url,
        services: project.services ?? []
      }))
    );
    if (options.json) return printJson({ projects });
    for (const project of projects) console.log(`${project.name}\t${project.status}\t${project.pid ?? "-"}\t${project.port ?? "-"}\t${project.url ?? "-"}`);
  });

program
  .command("logs")
  .argument("<project>")
  .option("--follow", "Follow logs.")
  .option("--json", "Print JSON.")
  .description("Show project logs.")
  .action(async (name, options) => {
    const { config } = await loadConfig();
    const project = findProject(config, name);
    const logFile = project.logFile ?? projectLogPath(project.name);
    if (options.json) return printJson({ project: name, logFile, content: (await fs.pathExists(logFile)) ? await fs.readFile(logFile, "utf8") : "" });
    if (options.follow) {
      await execa("tail", ["-f", logFile], { stdio: "inherit" });
      return;
    }
    if (await fs.pathExists(logFile)) console.log(await fs.readFile(logFile, "utf8"));
    else warn(`No log file found for ${name}: ${logFile}`);
  });

program
  .command("doctor")
  .option("--json", "Print JSON.")
  .description("Inspect configuration and local environment.")
  .action(async (options) => {
    const { path, config } = await loadConfig();
    const issues = await runDoctor(path, config);
    if (options.json) {
      printJson({ issues });
      if (issues.some((issue) => issue.level === "error")) process.exitCode = 1;
      return;
    }
    for (const issue of issues) {
      const message = `${issue.message}${issue.suggestion ? ` Suggestion: ${issue.suggestion}` : ""}`;
      if (issue.level === "ok") ok(message);
      else if (issue.level === "warn") warn(message);
      else printError(message);
    }
    if (issues.some((issue) => issue.level === "error")) process.exitCode = 1;
  });

program
  .command("ports")
  .option("--json", "Print JSON.")
  .description("List local listening ports and match registered projects.")
  .action(async (options) => {
    const proxyConfig = (await findProxyConfig()) ? (await loadProxyConfig()).config : null;
    const ymlConfig = !proxyConfig && (await findConfig()) ? (await loadConfig()).config : null;
    const usages = await listListeningPorts();
    const rows = usages.map((usage) => ({
      ...usage,
      registeredProject:
        proxyConfig?.projects.find((project) => targetPort(project.target) === usage.port)?.name ??
        ymlConfig?.projects.find((project) => project.port === usage.port)?.name
    }));
    if (options.json) return printJson({ ports: rows });
    for (const row of rows) console.log(`${row.port}\t${row.command ?? "-"}\t${row.pid ?? "-"}\t${row.registeredProject ?? "-"}`);
  });

program
  .command("proxy")
  .description("Start the local HTTP reverse proxy from kiban.config.json.")
  .action(async () => {
    const { config } = await loadProxyConfig();
    const server = await startProxy(config);
    ok(`Proxy listening on http://localhost:${config.proxyPort}`);
    for (const project of config.projects) {
      console.log(`${proxyUrl(config, project.host)} -> ${project.target}`);
    }

    const close = () => {
      server.close(() => process.exit(0));
    };
    process.once("SIGINT", close);
    process.once("SIGTERM", close);
  });

program
  .command("kill-port")
  .argument("<port>")
  .option("--force", "Skip confirmation.")
  .description("Kill the process listening on a port.")
  .action(async (portValue, options) => {
    const port = Number(portValue);
    const usage = await getPortUsage(port);
    if (!usage?.pid) throw new Error(`No process found on port ${port}.`);
    if (!options.force) throw new Error(`Refusing to kill pid ${usage.pid} without --force.`);
    process.kill(usage.pid, "SIGTERM");
    ok(`Killed pid ${usage.pid} on port ${port}`);
  });

program
  .command("open")
  .argument("<project>")
  .description("Open a project URL in the browser.")
  .action(async (name) => {
    if (await findProxyConfig()) {
      const { config } = await loadProxyConfig();
      const project = findProxyProject(config, name);
      const url = proxyUrl(config, project.host);
      await open(url);
      ok(`Opened ${url}`);
      return;
    }

    const { config } = await loadConfig();
    const project = findProject(config, name);
    if (!project.url) throw new Error(`${name} has no url configured.`);
    await open(project.url);
    ok(`Opened ${project.url}`);
  });

program
  .command("edit")
  .argument("<project>")
  .description("Open a project in an editor.")
  .action(async (name) => {
    const { config } = await loadConfig();
    const project = findProject(config, name);
    await execa(project.editor ?? "code", [project.path], { stdio: "inherit" });
  });

program
  .command("start")
  .argument("[projects...]")
  .option("--all", "Start all projects.")
  .option("-d, --detach", "Start projects in the background without following logs.")
  .option("--follow", "Follow project logs after starting. This is the default unless --detach is used.")
  .description("Alias for up.")
  .action(async (names: string[], options) => {
    const { config } = await loadConfig();
    const targets = options.all ? config.projects : names.map((name) => findProject(config, name));
    if (targets.length === 0) throw new Error("Specify a project name or --all.");
    const logFiles: string[] = [];
    const logOffsets = new Map<string, number>();
    for (const project of targets) {
      const logFile = project.logFile ?? projectLogPath(project.name);
      logOffsets.set(logFile, await fileSize(logFile));
      const result = await startProject(config, project);
      ok(`${project.name} ${result.alreadyRunning ? "already running" : "started"}${result.pid ? ` (pid ${result.pid})` : ""}`);
      logFiles.push(result.logFile ?? logFile);
    }
    if (!options.detach || options.follow) await followLogs(logFiles, logOffsets);
  });

program
  .command("stop")
  .argument("<projects...>")
  .option("--with-services", "Stop dependent Docker services too.")
  .description("Alias for down.")
  .action(async (names: string[], options) => {
    const { config } = await loadConfig();
    for (const name of names) {
      const result = await stopProject(config, findProject(config, name), Boolean(options.withServices));
      ok(`${name} stopped${result.pid ? ` (pid ${result.pid})` : ""}`);
    }
  });

program.parseAsync().catch((err: Error & { code?: number }) => {
  printError(err.message);
  process.exit(typeof err.code === "number" ? err.code : 1);
});

async function fileSize(filePath: string) {
  try {
    return (await fs.stat(filePath)).size;
  } catch {
    return 0;
  }
}

async function followLogs(logFiles: string[], offsets: Map<string, number>) {
  if (logFiles.length === 1) {
    const [logFile] = logFiles;
    const offset = (offsets.get(logFile) ?? 0) + 1;
    await execa("tail", ["-c", `+${offset}`, "-f", logFile], { stdio: "inherit" });
    return;
  }

  await execa("tail", ["-n", "0", "-f", ...logFiles], { stdio: "inherit" });
}

function prefixLines(projectName: string, chunk: Buffer) {
  return chunk
    .toString()
    .split(/\r?\n/)
    .map((line, index, lines) => (index === lines.length - 1 && line === "" ? "" : `[${projectName}] ${line}`))
    .join("\n");
}

async function startProjectServices(config: Awaited<ReturnType<typeof loadProxyConfig>>["config"]) {
  const serviceNames = [...new Set(config.projects.flatMap((project) => project.services ?? []))];
  if (serviceNames.length === 0) return;
  await startNamedServices(config, serviceNames);
}

async function startNamedServices(config: Awaited<ReturnType<typeof loadProxyConfig>>["config"], serviceNames: string[]) {
  if (!(await isDockerRunning())) {
    const error = new Error("Docker is not running. Start Docker Desktop or OrbStack before running projects with services.") as Error & { code: number };
    error.code = 4;
    throw error;
  }

  const started = new Set<string>();
  const startOne = async (name: string) => {
    if (started.has(name)) return;
    const service = findProxyService(config, name);
    for (const dependency of service.dependsOn ?? []) {
      await startOne(dependency);
    }
    ok(`Starting service ${service.name}: ${service.image}`);
    await upService(config, service);
    const healthy = await waitForHealth(service.healthCheck);
    if (!healthy) {
      const error = new Error(`Service health check failed: ${service.name}`) as Error & { code: number };
      error.code = 5;
      throw error;
    }
    started.add(name);
  };

  for (const name of serviceNames) {
    await startOne(name);
  }
}

async function assertPortAvailableForDev(port: number, projectName: string) {
  const usage = await getPortUsage(port);
  if (!usage?.pid) return;
  const error = new Error(
    `${projectName}: target port ${port} is already in use by ${usage.command ?? "unknown"} pid ${usage.pid}. ` +
      `Stop it or run \`kiban kill-port ${port} --force\`.`
  ) as Error & { code: number };
  error.code = 3;
  throw error;
}
