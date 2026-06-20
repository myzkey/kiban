import type { ChildProcess } from "node:child_process";
import { spawnStreamingProject, stopProcess, stopProcesses } from "./process.js";
import { getPortUsage } from "./ports.js";
import { targetPort } from "./proxy.js";
import { assertProxyPortUsable, closeProxyHandle, startOrReuseProxy } from "./proxy-runtime.js";
import { startProjectServices } from "./service-runtime.js";
import { kibacoError } from "./errors.js";
import { projectLogPath } from "./paths.js";
import { ALL_PROJECTS_RESTART, consumeRestartRequests } from "./restart.js";
import type { ProxyConfig } from "./types.js";

export async function runDev(config: ProxyConfig, options: { projects?: string[]; streamLogs?: boolean } = {}) {
  if (config.projects.length === 0) throw new Error("No projects configured in this Kibaco workspace.");
  const activeProjects =
    options.projects && options.projects.length > 0
      ? options.projects.map((name) => {
          const project = config.projects.find((item) => item.name === name);
          if (!project) throw kibacoError(`Project not found: ${name}`, 6);
          return project;
        })
      : config.projects;
  const activeConfig = { ...config, projects: activeProjects };

  console.log("Kibaco dev starting...");
  console.log("");

  await assertProxyPortUsable(config.proxyPort);
  await startProjectServices(activeConfig, { print: true });
  await assertProjectTargetPortsAvailable(activeConfig);

  console.log("");
  console.log("Projects:");
  const children = new Map<string, ChildProcess>();
  const restarting = new Set<string>();
  let shuttingDown = false;
  let resolveAllExited: (() => void) | undefined;
  const allExited = new Promise<void>((resolve) => {
    resolveAllExited = resolve;
  });

  const startProject = (projectName: string) => {
    const project = activeProjects.find((item) => item.name === projectName);
    if (!project) return;
    console.log(`  ${project.name.padEnd(14)} ${project.command}`);
    console.log(`  ${"".padEnd(14)} logs: ${projectLogPath(config.workspace, project.name)}`);
    const child = spawnStreamingProject(project, { workspace: config.workspace, log: config.log, stream: options.streamLogs ?? false });
    children.set(project.name, child);
    child.once("exit", () => {
      if (restarting.has(project.name) || shuttingDown) return;
      children.delete(project.name);
      if (children.size === 0) resolveAllExited?.();
    });
  };

  for (const project of activeProjects) startProject(project.name);

  const proxyHandle = await startOrReuseProxy(activeConfig);
  const restartTimer = setInterval(() => {
    void handleRestartRequests();
  }, 500);

  async function handleRestartRequests() {
    const requests = await consumeRestartRequests(config.workspace);
    if (requests.length === 0 || shuttingDown) return;
    const requestedNames = requests.includes(ALL_PROJECTS_RESTART) ? activeProjects.map((project) => project.name) : requests;
    for (const projectName of [...new Set(requestedNames)]) {
      if (!activeProjects.some((project) => project.name === projectName)) continue;
      await restartProject(projectName);
    }
  }

  async function restartProject(projectName: string) {
    console.log("");
    console.log(`Restarting ${projectName}...`);
    restarting.add(projectName);
    const child = children.get(projectName);
    if (child && child.exitCode === null) {
      stopProcess(child);
      await waitForExit(child, 5_000);
    }
    children.delete(projectName);
    restarting.delete(projectName);
    startProject(projectName);
  }

  const shutdown = async (code: number) => {
    shuttingDown = true;
    clearInterval(restartTimer);
    console.log("");
    console.log("Stopping Kibaco dev...");
    console.log("");
    console.log("Projects:");
    for (const project of activeProjects) console.log(`  ${project.name.padEnd(14)} stopping`);
    stopProcesses([...children.values()]);
    console.log("");
    console.log("Proxy:");
    await closeProxyHandle(proxyHandle);
    console.log(`  ${proxyHandle.reused ? "left running (reused existing proxy)" : "stopped"}`);
    if (activeProjects.some((project) => (project.services ?? []).length > 0)) {
      console.log("");
      console.log("Docker services:");
      console.log("  left running (use `kibaco services down` to stop them)");
    }
    process.exit(code);
  };

  process.once("SIGINT", () => {
    void shutdown(130);
  });
  process.once("SIGTERM", () => {
    void shutdown(143);
  });

  await allExited;
  clearInterval(restartTimer);
  await closeProxyHandle(proxyHandle);
}

async function waitForExit(child: ChildProcess, timeoutMs: number) {
  if (child.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, timeoutMs);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function assertProjectTargetPortsAvailable(config: ProxyConfig) {
  for (const project of config.projects) {
    const port = targetPort(project.target);
    if (!port) continue;
    const usage = await getPortUsage(port);
    if (!usage?.pid) continue;
    throw kibacoError(
      `${project.name}: target port ${port} is already in use by ${usage.command ?? "unknown"} pid ${usage.pid}. ` +
        `Stop it or run \`kibaco kill-port ${port} --force\`.`,
      3
    );
  }
}
