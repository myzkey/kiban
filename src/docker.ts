import { execa } from "execa";
import path from "node:path";
import type { ServiceConfig } from "./types.js";

type DockerStackConfig = {
  workspace: string;
};

export function containerName(config: DockerStackConfig, service: ServiceConfig) {
  return `kibaco-${config.workspace}-${service.name}`.replace(/[^a-zA-Z0-9_.-]/g, "-");
}

export function isComposeService(service: ServiceConfig) {
  return Boolean(service.composeFile);
}

export function serviceTarget(config: DockerStackConfig, service: ServiceConfig) {
  return isComposeService(service) ? `docker compose service ${service.name}` : containerName(config, service);
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
  if (isComposeService(service)) {
    const container = await composeServiceContainer(service);
    if (!container) return false;
    try {
      const { stdout } = await execa("docker", ["inspect", "-f", "{{.State.Running}}", container]);
      return stdout.trim() === "true";
    } catch {
      return false;
    }
  }

  try {
    const { stdout } = await execa("docker", ["inspect", "-f", "{{.State.Running}}", containerName(config, service)]);
    return stdout.trim() === "true";
  } catch {
    return false;
  }
}

export async function serviceHealthy(config: DockerStackConfig, service: ServiceConfig) {
  if (!isComposeService(service)) return serviceRunning(config, service);
  const container = await composeServiceContainer(service);
  if (!container) return false;
  try {
    const { stdout } = await execa("docker", ["inspect", "-f", "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}", container]);
    const status = stdout.trim();
    return status === "healthy" || status === "running";
  } catch {
    return false;
  }
}

export async function upService(config: DockerStackConfig, service: ServiceConfig) {
  if (isComposeService(service)) {
    await execa("docker", [...composeArgs(service), "up", "-d", service.name]);
    return;
  }

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
  if (isComposeService(service)) {
    try {
      await execa("docker", [...composeArgs(service), "stop", service.name]);
    } catch {
      // Already stopped or missing.
    }
    return;
  }

  const name = containerName(config, service);
  try {
    await execa("docker", ["stop", name]);
  } catch {
    // Already stopped or missing.
  }
}

export async function execServiceCommand(config: DockerStackConfig, service: ServiceConfig, command: string) {
  if (isComposeService(service)) {
    await execa("docker", [...composeArgs(service), "exec", "-T", service.name, "sh", "-lc", command]);
    return;
  }

  await execa("docker", ["exec", containerName(config, service), "sh", "-lc", command]);
}

export async function serviceLogTail(config: DockerStackConfig, service: ServiceConfig, lines = 80) {
  if (isComposeService(service)) {
    try {
      const { stdout, stderr } = await execa("docker", [...composeArgs(service), "logs", "--tail", String(lines), service.name]);
      return [stdout, stderr].filter(Boolean).join("\n").trim();
    } catch (error) {
      return String((error as { stderr?: string; message?: string }).stderr ?? (error as Error).message).trim();
    }
  }

  try {
    const { stdout, stderr } = await execa("docker", ["logs", "--tail", String(lines), containerName(config, service)]);
    return [stdout, stderr].filter(Boolean).join("\n").trim();
  } catch (error) {
    return String((error as { stderr?: string; message?: string }).stderr ?? (error as Error).message).trim();
  }
}

export async function serviceLogs(config: DockerStackConfig, service: ServiceConfig, options: { follow?: boolean; tail?: number } = {}) {
  if (isComposeService(service)) {
    const args = [...composeArgs(service), "logs"];
    if (options.tail) args.push("--tail", String(options.tail));
    if (options.follow) args.push("-f");
    args.push(service.name);
    await execa("docker", args, { stdio: "inherit" });
    return;
  }

  const args = ["logs"];
  if (options.tail) args.push("--tail", String(options.tail));
  if (options.follow) args.push("-f");
  args.push(containerName(config, service));
  await execa("docker", args, { stdio: "inherit" });
}

export async function serviceContainerName(config: DockerStackConfig, service: ServiceConfig) {
  if (isComposeService(service)) return (await composeServiceContainer(service)) ?? serviceTarget(config, service);
  return containerName(config, service);
}

function composeArgs(service: ServiceConfig) {
  const composeFile = service.composeFile;
  if (!composeFile) throw new Error(`Missing composeFile for service ${service.name}`);
  return ["compose", "--project-directory", path.dirname(composeFile), "-f", composeFile];
}

async function composeServiceContainer(service: ServiceConfig) {
  try {
    const { stdout } = await execa("docker", [...composeArgs(service), "ps", "-q", service.name]);
    return stdout.trim().split("\n").filter(Boolean)[0];
  } catch {
    return "";
  }
}
