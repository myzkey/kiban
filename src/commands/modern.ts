import readline from "node:readline/promises";
import type { Command } from "commander";
import open from "open";
import {
  buildInitialProxyConfig,
  discoverProxyConfig,
  findProxyProject,
  formatProxyConfig,
  loadProxyConfig,
  updateProjectTarget,
  validateProxyConfig,
  writeExampleProxyConfig,
  writeInitialProxyConfig
} from "../config.js";
import { buildProxyDoctorReport } from "../doctor.js";
import { runDev } from "../dev.js";
import { assertProxyPortAvailable } from "../proxy-runtime.js";
import { getServiceStatuses, showServiceLogs, startServices, stopServices } from "../service-runtime.js";
import { listListeningPorts } from "../ports.js";
import { proxyUrl, startProxy, targetPort } from "../proxy.js";
import { printJson, ok } from "../output.js";
import { ensureProjectLogFiles, fileSize, followLogs, printLogTail, projectLogFiles } from "../process.js";
import { ALL_PROJECTS_RESTART, requestProjectRestart } from "../restart.js";
import type { ProxyConfig } from "../types.js";

export function registerModernCommands(program: Command) {
  program
    .command("init")
    .option("--workspace <name>")
    .option("--proxy-port <port>")
    .option("--project <name>")
    .option("--host <host>")
    .option("--target <url>")
    .option("--cmd <command>")
    .option("--cwd <path>")
    .option("--detect", "Print the inferred config without writing it.")
    .option("--example", "Write kibaco.config.example.json without writing local config.")
    .option("--force", "Overwrite the existing Kibaco config for this workspace.")
    .option("--interactive", "Review inferred values interactively before writing.")
    .description("Create a Kibaco config for this local workspace.")
    .action(async (options) => {
      const answers = {
        workspace: options.workspace,
        proxyPort: options.proxyPort ? Number(options.proxyPort) : undefined,
        projectName: options.project,
        host: options.host,
        target: options.target,
        command: options.cmd,
        cwd: options.cwd
      };
      if (options.detect) {
        printJson(await buildInitialProxyConfig(answers, process.cwd(), { interactive: false }));
        return;
      }
      if (options.example) {
        const config = await buildInitialProxyConfig(answers, process.cwd(), { interactive: Boolean(options.interactive) });
        const examplePath = await writeExampleProxyConfig(process.cwd(), config);
        ok(`Created ${examplePath}`);
        return;
      }
      const configPath = await writeInitialProxyConfig(undefined, answers, process.cwd(), { interactive: Boolean(options.interactive), force: Boolean(options.force) });
      ok(`${options.force ? "Updated" : "Created"} ${configPath}`);
    });

  registerConfigCommand(program);

  program
    .command("list")
    .option("--json", "Print JSON.")
    .description("Show configured projects and local URLs.")
    .action(async (options) => {
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
    });

  program
    .command("urls")
    .option("--json", "Print JSON.")
    .description("Show configured local URLs.")
    .action(async (options) => {
      const { config } = await loadProxyConfig();
      const rows = config.projects.map((project) => ({
        name: project.name,
        url: proxyUrl(config, project.host),
        target: project.target
      }));
      if (options.json) return printJson({ urls: rows });
      for (const row of rows) console.log(`${row.name}\t${row.url}\t-> ${row.target}`);
    });

  program
    .command("status")
    .option("--json", "Print JSON.")
    .description("Show workspace, service, and project status.")
    .action(async (options) => {
      const { path, config } = await loadProxyConfig();
      const report = await buildProxyDoctorReport(path, config);
      if (options.json) {
        printJson(report);
        if (report.issues.some((issue) => issue.level === "error")) process.exitCode = 1;
        return;
      }

      console.log(`workspace\t${report.workspace}`);
      console.log(`proxy\tlocalhost:${report.proxyPort}`);
      if (report.services.length > 0) {
        console.log("services");
        for (const service of report.services) console.log(`  ${service.name}\t${service.status}`);
      }
      if (report.projects.length > 0) {
        console.log("projects");
        for (const project of report.projects) console.log(`  ${project.name}\t${project.status}\t${project.url}\t-> ${project.target}`);
      }
      const warnings = report.issues.filter((issue) => issue.level === "warn").length;
      const errors = report.issues.filter((issue) => issue.level === "error").length;
      console.log(`issues\t${errors} error(s), ${warnings} warning(s)`);
      if (errors > 0) process.exitCode = 1;
    });

  program
    .command("export")
    .description("Print a shareable JSON view of this development environment.")
    .action(async () => {
      const { config } = await loadProxyConfig();
      printJson({
        workspace: config.workspace,
        proxyPort: config.proxyPort,
        services: config.services,
        projects: config.projects.map((project) => ({
          name: project.name,
          url: proxyUrl(config, project.host),
          target: project.target,
          command: project.command,
          cwd: project.cwd,
          services: project.services ?? []
        }))
      });
    });

  program
    .command("dev")
    .argument("[projects...]")
    .option("--select", "Choose projects to start interactively.")
    .option("--verbose", "Stream project stdout/stderr to the terminal.")
    .option("--quiet", "Keep project stdout/stderr out of the terminal. This is the default.")
    .description("Start services, app commands, and the local proxy.")
    .action(async (projects: string[], options) => {
      const { config } = await loadProxyConfig();
      const selectedProjects = options.select ? await promptDevProjects(config) : projects;
      await runDev(config, { projects: selectedProjects, streamLogs: Boolean(options.verbose) && !options.quiet });
    });

  program
    .command("restart")
    .argument("[project]")
    .option("--all", "Restart all configured projects.")
    .description("Ask the running kibaco dev process to restart project commands.")
    .action(async (name: string | undefined, options) => {
      const { config } = await loadProxyConfig();
      if (!options.all && !name) throw new Error("Project name is required unless --all is used.");
      if (options.all) {
        await requestProjectRestart(config.workspace, ALL_PROJECTS_RESTART);
        ok("Restart requested for all projects");
        return;
      }
      findProxyProject(config, name ?? "");
      await requestProjectRestart(config.workspace, name ?? "");
      ok(`Restart requested for ${name}`);
    });

  registerServicesCommand(program);

  program
    .command("ports")
    .option("--json", "Print JSON.")
    .description("Show local listening ports and matching projects.")
    .action(async (options) => {
      const { config } = await loadProxyConfig();
      const usages = await listListeningPorts();
      const rows = usages.map((usage) => ({
        ...usage,
        registeredProject: config.projects.find((project) => targetPort(project.target) === usage.port)?.name
      }));
      if (options.json) return printJson({ ports: rows });
      for (const row of rows) console.log(`${row.port}\t${row.command ?? "-"}\t${row.pid ?? "-"}\t${row.registeredProject ?? "-"}`);
    });

  program
    .command("logs")
    .argument("[target]")
    .option("-f, --follow", "Follow logs.")
    .option("--all", "Show logs for all configured projects.")
    .option("--service", "Show logs for a configured Docker service.")
    .option("--all-services", "Show logs for all configured Docker services.")
    .option("--tail <lines>", "Number of lines to show before following.", "100")
    .option("--jsonl", "Read structured JSONL logs.")
    .description("Show project process logs or Docker service logs.")
    .action(async (name: string | undefined, options) => {
      const { config } = await loadProxyConfig();
      const tailLines = Number(options.tail);
      const tail = Number.isFinite(tailLines) ? tailLines : 100;
      if (options.allServices) {
        if (options.follow) throw new Error("--follow can only be used with one service.");
        if (config.services.length === 0) throw new Error("No services configured in this Kibaco workspace.");
        for (const service of config.services) {
          console.log(`==> ${service.name} <==`);
          await showServiceLogs(config, service.name, { tail });
        }
        return;
      }
      if (options.service) {
        if (!name) throw new Error("Service name is required when --service is used.");
        await showServiceLogs(config, name, { follow: Boolean(options.follow), tail });
        return;
      }
      const selected = !options.all && !name ? await promptLogTarget(config) : undefined;
      if (!options.all && !name && !selected) throw new Error("Project or service name is required unless --all is used.");
      if (selected?.type === "service") {
        await showServiceLogs(config, selected.name, { follow: Boolean(options.follow), tail });
        return;
      }
      const targetName = selected?.name ?? name;
      const project = !options.all && name ? config.projects.find((entry) => entry.name === name) : undefined;
      const selectedProject = selected?.type === "project" ? config.projects.find((entry) => entry.name === selected.name) : undefined;
      if (!options.all && !project && targetName && config.services.some((entry) => entry.name === targetName)) {
        await showServiceLogs(config, targetName, { follow: Boolean(options.follow), tail });
        return;
      }
      const projects = options.all ? config.projects : [selectedProject ?? project ?? findProxyProject(config, targetName ?? "")];
      const format = options.jsonl ? "jsonl" : "text";
      const logFiles = projects.flatMap((project) => {
        ensureProjectLogFiles(config.workspace, project.name);
        return projectLogFiles(config.workspace, project.name, format);
      });
      await printLogTail(logFiles, tail);
      if (options.follow) {
        const offsets = new Map<string, number>();
        for (const logFile of logFiles) offsets.set(logFile, await fileSize(logFile));
        await followLogs(logFiles, offsets);
      }
    });

  program
    .command("proxy")
    .description("Start only the local reverse proxy.")
    .action(async () => {
      const { config } = await loadProxyConfig();
      await assertProxyPortAvailable(config.proxyPort);
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
    .command("open")
    .argument("[project]")
    .description("List configured project URLs or open one in the browser.")
    .action(async (name: string | undefined) => {
      const { config } = await loadProxyConfig();
      if (!name) {
        for (const project of config.projects) console.log(`${project.name}\t${proxyUrl(config, project.host)}`);
        return;
      }
      const project = findProxyProject(config, name);
      const url = proxyUrl(config, project.host);
      await open(url);
      ok(`Opened ${url}`);
    });

  program
    .command("explain")
    .description("Explain how Kibaco manages this local development environment.")
    .action(async () => {
      const discovery = await discoverProxyConfig();
      console.log("This project uses Kibaco.");
      console.log("");
      console.log("Kibaco manages local app commands, local URLs, reverse proxy routing, and optional Docker services.");
      console.log("");
      console.log("Config discovery:");
      for (const item of discovery.checked) {
        const status = item.used ? "used" : item.found ? "found" : "not found";
        console.log(`* checked ${item.path}: ${status}`);
      }
      if (!discovery.configPath) {
        console.log("* no Kibaco config found");
        return;
      }

      const { path, config } = await loadProxyConfig();
      console.log("");
      console.log(`Config file: ${path}`);
      console.log("Local config is developer-specific and should not be committed.");
      console.log(`proxyPort: ${config.proxyPort}`);
      console.log("");
      console.log("Routes:");
      for (const project of config.projects) {
        console.log(`* ${project.name}: ${proxyUrl(config, project.host)} -> ${project.target}`);
        console.log(`  cwd: ${project.cwd}`);
        console.log(`  command: ${project.command}`);
      }
      console.log("");
      console.log("Common commands:");
      console.log("* kibaco config validate");
      console.log("* kibaco config list-routes");
      console.log("* kibaco config set-target <projectName> <targetUrl>");
      console.log("* kibaco dev");
      console.log("* kibaco doctor");
      console.log("");
      console.log("When local URLs fail, check Kibaco config before Caddy, nginx, docker-compose, or system proxy settings.");
    });
}

function registerConfigCommand(program: Command) {
  const configCommand = program.command("config").description("Inspect, validate, and safely edit the Kibaco config.");

  configCommand
    .command("validate")
    .description("Validate the current Kibaco config.")
    .action(async () => {
      const result = await validateProxyConfig();
      console.log(`Config file: ${result.path}`);
      console.log(`Valid: ${result.valid}`);
      for (const issue of result.errors) {
        console.log(`${issue.message}${issue.example ? `. Example: ${issue.example}` : ""}`);
      }
      if (!result.valid) process.exitCode = 1;
    });

  configCommand
    .command("format")
    .description("Format the current Kibaco config JSON.")
    .action(async () => {
      const configPath = await formatProxyConfig();
      ok(`Formatted ${configPath}`);
    });

  configCommand
    .command("list-routes")
    .description("Show Kibaco proxy routes from the current config.")
    .action(async () => {
      const { config } = await loadProxyConfig();
      for (const project of config.projects) {
        console.log(`${project.name}`);
        console.log(`  route: ${proxyUrl(config, project.host)} -> ${project.target}`);
        console.log(`  host: ${project.host}`);
        console.log(`  proxyPort: ${config.proxyPort}`);
        console.log(`  target: ${project.target}`);
        console.log(`  cwd: ${project.cwd}`);
        console.log(`  command: ${project.command}`);
      }
    });

  configCommand
    .command("set-target")
    .argument("<projectName>")
    .argument("<targetUrl>")
    .description("Safely update projects[].target for one project.")
    .action(async (projectName: string, targetUrl: string) => {
      const result = await updateProjectTarget(projectName, targetUrl);
      console.log(`Updated project "${result.projectName}" target:`);
      console.log(`before: ${result.before}`);
      console.log(`after:  ${result.after}`);
      console.log(`Config file: ${result.path}`);
      console.log(`Config valid: ${result.valid}`);
    });
}

type LogTarget = {
  type: "project" | "service";
  name: string;
};

async function promptLogTarget(config: ProxyConfig): Promise<LogTarget | undefined> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return undefined;

  const choices: LogTarget[] = [
    ...config.projects.map((project) => ({ type: "project" as const, name: project.name })),
    ...config.services.map((service) => ({ type: "service" as const, name: service.name }))
  ];
  if (choices.length === 0) return undefined;

  console.log("Select logs to show:");
  choices.forEach((choice, index) => {
    console.log(`  ${index + 1}) ${choice.name} (${choice.type})`);
  });

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question("logs> ");
    const index = Number(answer.trim());
    if (!Number.isInteger(index) || index < 1 || index > choices.length) throw new Error("Invalid log selection.");
    return choices[index - 1];
  } finally {
    rl.close();
  }
}

async function promptDevProjects(config: ProxyConfig): Promise<string[]> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("--select requires an interactive terminal.");
  if (config.projects.length === 0) throw new Error("No projects configured in this Kibaco workspace.");

  console.log("Select projects to start:");
  console.log("  0) all projects");
  config.projects.forEach((project, index) => {
    const services = project.services && project.services.length > 0 ? ` services: ${project.services.join(", ")}` : "";
    console.log(`  ${index + 1}) ${project.name}${services}`);
  });

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question("dev> ");
    const text = answer.trim();
    if (text === "0" || text.toLowerCase() === "all") return [];
    const indexes = text
      .split(",")
      .map((part) => Number(part.trim()))
      .filter((value) => Number.isInteger(value));
    if (indexes.length === 0 || indexes.some((index) => index < 1 || index > config.projects.length)) {
      throw new Error("Invalid project selection.");
    }
    return [...new Set(indexes.map((index) => config.projects[index - 1]?.name).filter((name): name is string => Boolean(name)))];
  } finally {
    rl.close();
  }
}

function registerServicesCommand(program: Command) {
  const servicesCommand = program.command("services").description("Manage Docker services for this workspace.");

  servicesCommand
    .command("up")
    .argument("[services...]")
    .description("Start configured Docker services.")
    .action(async (names: string[]) => {
      const { config } = await loadProxyConfig();
      const targets = names.length > 0 ? names : config.services.map((service) => service.name);
      if (targets.length === 0) throw new Error("No services configured in this Kibaco workspace.");
      await startServices(config, targets, { print: true });
    });

  servicesCommand
    .command("down")
    .argument("[services...]")
    .description("Stop configured Docker services.")
    .action(async (names: string[]) => {
      const { config } = await loadProxyConfig();
      const targets = names.length > 0 ? names : config.services.map((service) => service.name);
      if (targets.length === 0) throw new Error("No services configured in this Kibaco workspace.");
      await stopServices(config, targets);
      for (const name of targets) ok(`Stopped service ${name}`);
    });

  servicesCommand
    .command("restart")
    .argument("[services...]")
    .description("Restart configured Docker services.")
    .action(async (names: string[]) => {
      const { config } = await loadProxyConfig();
      const targets = names.length > 0 ? names : config.services.map((service) => service.name);
      if (targets.length === 0) throw new Error("No services configured in this Kibaco workspace.");
      await stopServices(config, targets);
      await startServices(config, targets, { print: true });
      for (const name of targets) ok(`Restarted service ${name}`);
    });

  servicesCommand
    .command("status")
    .option("--json", "Print JSON.")
    .description("Show Docker service status.")
    .action(async (options) => {
      const { config } = await loadProxyConfig();
      const rows = await getServiceStatuses(config);
      if (options.json) return printJson({ services: rows });
      for (const row of rows) {
        console.log(`${row.name}\t${row.running ? "running" : "stopped"}\t${row.container}\t${row.ports.join(",")}`);
      }
    });

  servicesCommand
    .command("logs")
    .argument("<service>")
    .option("-f, --follow", "Follow logs.")
    .option("--tail <lines>", "Number of lines to show before following.", "100")
    .description("Show Docker service logs.")
    .action(async (name: string, options) => {
      const { config } = await loadProxyConfig();
      const tailLines = Number(options.tail);
      await showServiceLogs(config, name, { follow: Boolean(options.follow), tail: Number.isFinite(tailLines) ? tailLines : 100 });
    });
}
