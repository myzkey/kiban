import type { Command } from "commander";
import open from "open";
import { buildInitialProxyConfig, findProxyProject, loadProxyConfig, writeInitialProxyConfig } from "../config.js";
import { runDev } from "../dev.js";
import { assertProxyPortAvailable } from "../proxy-runtime.js";
import { getServiceStatuses, showServiceLogs, startServices, stopServices } from "../service-runtime.js";
import { listListeningPorts } from "../ports.js";
import { proxyUrl, startProxy, targetPort } from "../proxy.js";
import { printJson, ok } from "../output.js";

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
    .option("--interactive", "Review inferred values interactively before writing.")
    .description("Create a Kiban config for this local workspace.")
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
      const configPath = await writeInitialProxyConfig(undefined, answers, process.cwd(), { interactive: Boolean(options.interactive) });
      ok(`Created ${configPath}`);
    });

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
    .command("dev")
    .description("Start services, app commands, and the local proxy.")
    .action(async () => {
      const { config } = await loadProxyConfig();
      await runDev(config);
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
    .argument("<project>")
    .description("Open a configured project URL in the browser.")
    .action(async (name) => {
      const { config } = await loadProxyConfig();
      const project = findProxyProject(config, name);
      const url = proxyUrl(config, project.host);
      await open(url);
      ok(`Opened ${url}`);
    });
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
      if (targets.length === 0) throw new Error("No services configured in this Kiban workspace.");
      await startServices(config, targets, { print: true });
    });

  servicesCommand
    .command("down")
    .argument("[services...]")
    .description("Stop configured Docker services.")
    .action(async (names: string[]) => {
      const { config } = await loadProxyConfig();
      const targets = names.length > 0 ? names : config.services.map((service) => service.name);
      if (targets.length === 0) throw new Error("No services configured in this Kiban workspace.");
      await stopServices(config, targets);
      for (const name of targets) ok(`Stopped service ${name}`);
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
    .description("Show Docker service logs.")
    .action(async (name: string, options) => {
      const { config } = await loadProxyConfig();
      await showServiceLogs(config, name, { follow: Boolean(options.follow) });
    });
}
