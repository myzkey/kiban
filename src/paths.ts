import path from "node:path";
import os from "node:os";
import fs from "fs-extra";

const configuredKibanHome = process.env.KIBAN_HOME;
export const KIBAN_DIR = configuredKibanHome
  ? path.resolve(expandHome(configuredKibanHome))
  : path.join(os.homedir(), ".kiban");
export const LOG_DIR = path.join(KIBAN_DIR, "logs");
export const PID_DIR = path.join(KIBAN_DIR, "pids");
export const STATE_DIR = path.join(KIBAN_DIR, "state");
export const CACHE_DIR = path.join(KIBAN_DIR, "cache");
export const STATE_FILE = path.join(STATE_DIR, "state.json");

export async function ensureKibanDirs() {
  await fs.ensureDir(LOG_DIR);
  await fs.ensureDir(PID_DIR);
  await fs.ensureDir(STATE_DIR);
  await fs.ensureDir(CACHE_DIR);
}

export function expandHome(value: string) {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

export function projectLogPath(name: string) {
  return path.join(LOG_DIR, `${name}.log`);
}

export function projectPidPath(name: string) {
  return path.join(PID_DIR, `${name}.pid`);
}
