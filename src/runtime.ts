import fs from "fs-extra";
import { spawn } from "node:child_process";
import { findService } from "./config.js";
import { downService, isDockerRunning, upService } from "./docker.js";
import { waitForHealth } from "./health.js";
import { ensureKibanDirs, projectLogPath } from "./paths.js";
import { getPortUsage, isPortAvailable } from "./ports.js";
import { isProcessAlive, readPid, readState, removePid, writePid, writeState } from "./state.js";
import type { KibanConfig, ProjectConfig, RuntimeStatus } from "./types.js";

export async function startProject(config: KibanConfig, project: ProjectConfig) {
  await ensureKibanDirs();
  const existingPid = await readPid(project.name);
  if (existingPid && isProcessAlive(existingPid)) {
    return { status: "running" as RuntimeStatus, pid: existingPid, alreadyRunning: true };
  }

  for (const serviceName of project.services ?? []) {
    const service = findService(config, serviceName);
    if (!(await isDockerRunning())) {
      const error = new Error("Docker is not running.") as Error & { code: number };
      error.code = 4;
      throw error;
    }
    await upService(config, service);
    const ok = await waitForHealth(service.healthCheck);
    if (!ok) {
      const error = new Error(`Service health check failed: ${service.name}`) as Error & { code: number };
      error.code = 5;
      throw error;
    }
  }

  if (project.port && !(await isPortAvailable(project.port))) {
    const usage = await getPortUsage(project.port);
    const details = usage?.pid ? ` Used by ${usage.command ?? "unknown"} pid ${usage.pid}.` : "";
    const error = new Error(`Port ${project.port} is already in use.${details}`) as Error & { code: number };
    error.code = 3;
    throw error;
  }

  const logFile = project.logFile ?? projectLogPath(project.name);
  await fs.ensureFile(logFile);
  const out = await fs.open(logFile, "a");
  const child = spawn(project.command, {
    cwd: project.path,
    shell: true,
    detached: true,
    stdio: ["ignore", out, out],
    env: { ...process.env, ...(project.env ?? {}) }
  });
  if (!child.pid) throw new Error(`Failed to start project: ${project.name}`);
  child.unref();

  await writePid(project.name, child.pid);
  const state = await readState();
  state.projects[project.name] = {
    ...state.projects[project.name],
    pid: child.pid,
    status: "running",
    lastStartedAt: new Date().toISOString(),
    logFile
  };
  await writeState(state);

  const healthy = await waitForHealth(project.healthCheck, project.url);
  if (!healthy) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      try {
        process.kill(child.pid, "SIGTERM");
      } catch {
        // The child may have already exited after a failed bind or startup error.
      }
    }
    await removePid(project.name);
    const state = await readState();
    state.projects[project.name] = {
      ...state.projects[project.name],
      pid: child.pid,
      status: "stopped",
      lastStoppedAt: new Date().toISOString()
    };
    await writeState(state);
    const error = new Error(`Project health check failed: ${project.name}`) as Error & { code: number };
    error.code = 5;
    throw error;
  }
  return { status: "running" as RuntimeStatus, pid: child.pid, logFile };
}

export async function stopProject(config: KibanConfig, project: ProjectConfig, withServices = false) {
  const pid = await readPid(project.name);
  if (pid && isProcessAlive(pid)) {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      process.kill(pid, "SIGTERM");
    }
  }
  await removePid(project.name);

  if (withServices) {
    for (const serviceName of project.services ?? []) {
      await downService(config, findService(config, serviceName));
    }
  }

  const state = await readState();
  state.projects[project.name] = {
    ...state.projects[project.name],
    pid,
    status: "stopped",
    lastStoppedAt: new Date().toISOString()
  };
  await writeState(state);
  return { status: "stopped" as RuntimeStatus, pid };
}

export async function getProjectStatus(project: ProjectConfig) {
  const pid = await readPid(project.name);
  if (!pid) return { status: "stopped" as RuntimeStatus, pid: undefined };
  return { status: isProcessAlive(pid) ? ("running" as RuntimeStatus) : ("stale" as RuntimeStatus), pid };
}
