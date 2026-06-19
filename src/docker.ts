import { execa } from "execa";
import type { ServiceConfig } from "./types.js";

type DockerStackConfig = {
  workspace: string;
};

export function containerName(config: DockerStackConfig, service: ServiceConfig) {
  return `kibaco-${config.workspace}-${service.name}`.replace(/[^a-zA-Z0-9_.-]/g, "-");
}

export async function isDockerRunning() {
  try {
    await execa("docker", ["info"]);
    return true;
  } catch {
    return false;
  }
}

export async function serviceRunning(config: DockerStackConfig, service: ServiceConfig) {
  try {
    const { stdout } = await execa("docker", ["inspect", "-f", "{{.State.Running}}", containerName(config, service)]);
    return stdout.trim() === "true";
  } catch {
    return false;
  }
}

export async function upService(config: DockerStackConfig, service: ServiceConfig) {
  if (await serviceRunning(config, service)) return;

  const name = containerName(config, service);
  const args = ["run", "-d", "--name", name];
  for (const port of service.ports ?? []) args.push("-p", port);
  for (const [key, value] of Object.entries(service.env ?? {})) args.push("-e", `${key}=${value}`);
  for (const volume of service.volumes ?? []) args.push("-v", volume);
  args.push(service.image);

  try {
    await execa("docker", args);
  } catch (error) {
    const message = String((error as { stderr?: string; message?: string }).stderr ?? (error as Error).message);
    if (message.includes("is already in use")) {
      await execa("docker", ["start", name]);
      return;
    }
    throw error;
  }
}

export async function downService(config: DockerStackConfig, service: ServiceConfig) {
  const name = containerName(config, service);
  try {
    await execa("docker", ["stop", name]);
  } catch {
    // Already stopped or missing.
  }
}

export async function execServiceCommand(config: DockerStackConfig, service: ServiceConfig, command: string) {
  await execa("docker", ["exec", containerName(config, service), "sh", "-lc", command]);
}

export async function serviceLogTail(config: DockerStackConfig, service: ServiceConfig, lines = 80) {
  try {
    const { stdout, stderr } = await execa("docker", ["logs", "--tail", String(lines), containerName(config, service)]);
    return [stdout, stderr].filter(Boolean).join("\n").trim();
  } catch (error) {
    return String((error as { stderr?: string; message?: string }).stderr ?? (error as Error).message).trim();
  }
}

export async function serviceLogs(config: DockerStackConfig, service: ServiceConfig, options: { follow?: boolean; tail?: number } = {}) {
  const args = ["logs"];
  if (options.tail) args.push("--tail", String(options.tail));
  if (options.follow) args.push("-f");
  args.push(containerName(config, service));
  await execa("docker", args, { stdio: "inherit" });
}
