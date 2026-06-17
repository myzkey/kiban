import path from "node:path";
import os from "node:os";
import fs from "fs-extra";

export const KIBAN_DIR = kibanDir();
export const LOG_DIR = logDir();
export const PID_DIR = pidDir();
export const STATE_DIR = stateDir();
export const CACHE_DIR = cacheDir();
export const WORKSPACES_DIR = workspacesDir();
export const WORKSPACE_INDEX_FILE = workspaceIndexFile();
export const STATE_FILE = stateFile();

export async function ensureKibanDirs() {
  await fs.ensureDir(logDir());
  await fs.ensureDir(pidDir());
  await fs.ensureDir(stateDir());
  await fs.ensureDir(cacheDir());
  await fs.ensureDir(workspacesDir());
}

export function expandHome(value: string) {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

export function workspaceLogDir(workspace: string) {
  return path.join(logDir(), safePathPart(workspace));
}

export function projectLogPath(workspace: string, name: string, extension = "log") {
  return path.join(workspaceLogDir(workspace), `${safePathPart(name)}.${extension}`);
}

export function projectPidPath(name: string) {
  return path.join(pidDir(), `${name}.pid`);
}

export function restartRequestDir(workspace: string) {
  return path.join(stateDir(), "restart", safePathPart(workspace));
}

export function restartRequestPath(workspace: string, projectName: string) {
  return path.join(restartRequestDir(workspace), `${safePathPart(projectName)}.json`);
}

export function kibanDir() {
  const configuredKibanHome = process.env.KIBAN_HOME;
  return configuredKibanHome ? path.resolve(expandHome(configuredKibanHome)) : path.join(os.homedir(), ".kiban");
}

export function logDir() {
  return path.join(kibanDir(), "logs");
}

export function pidDir() {
  return path.join(kibanDir(), "pids");
}

export function stateDir() {
  return path.join(kibanDir(), "state");
}

export function cacheDir() {
  return path.join(kibanDir(), "cache");
}

export function workspacesDir() {
  return path.join(kibanDir(), "workspaces");
}

export function workspaceIndexFile() {
  return path.join(workspacesDir(), "index.json");
}

export function stateFile() {
  return path.join(stateDir(), "state.json");
}

function safePathPart(value: string) {
  return value.replace(/[^a-zA-Z0-9_.-]/g, "-");
}
