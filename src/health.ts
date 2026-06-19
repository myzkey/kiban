import net from "node:net";
import { execa } from "execa";
import type { HealthCheck } from "./types.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function waitForHealth(
  check: HealthCheck | undefined,
  fallbackUrl?: string,
  options: { runCommand?: (command: string) => Promise<boolean> } = {}
) {
  if (!check && !fallbackUrl) return true;
  const timeoutMs = check?.timeoutMs ?? 30_000;
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    if (await probeHealth(check, fallbackUrl, options)) return true;
    await sleep(500);
  }

  return false;
}

async function probeHealth(check: HealthCheck | undefined, fallbackUrl?: string, options: { runCommand?: (command: string) => Promise<boolean> } = {}) {
  if (!check || check.type === "http") {
    const url = check?.url ?? fallbackUrl;
    if (!url) return true;
    try {
      const response = await fetch(url, { method: "GET" });
      return response.status > 0;
    } catch {
      return false;
    }
  }

  if (check.type === "tcp") {
    if (!check.port) return false;
    return probeTcp(check.host ?? "127.0.0.1", check.port);
  }

  if (check.type === "command") {
    if (!check.command) return false;
    if (options.runCommand) return options.runCommand(check.command);
    try {
      await execa(check.command, { shell: true });
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

function probeTcp(host: string, port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = net.connect({ host, port, timeout: 1000 });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}
