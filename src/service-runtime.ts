import { containerName, downService, execServiceCommand, isDockerRunning, serviceLogTail, serviceLogs, serviceRunning, upService } from "./docker.js";
import { waitForHealth } from "./health.js";
import { kibacoError } from "./errors.js";
import type { ServiceConfig } from "./types.js";

export type ServiceStackConfig = {
  workspace: string;
  services: ServiceConfig[];
};

export type ServiceStatusRow = {
  name: string;
  image: string;
  container: string;
  running: boolean;
  ports: string[];
};

export function findStackService(config: ServiceStackConfig, name: string) {
  const service = config.services.find((item) => item.name === name);
  if (!service) throw kibacoError(`Service not found: ${name}`, 7);
  return service;
}

export async function startServices(config: ServiceStackConfig, serviceNames: string[], options: { print?: boolean } = {}) {
  if (serviceNames.length === 0) return;
  if (!(await isDockerRunning())) {
    throw kibacoError("Docker is not running. Start Docker Desktop or OrbStack before running projects with services.", 4);
  }

  const started = new Set<string>();
  if (options.print) console.log("Services:");

  const startOne = async (name: string) => {
    if (started.has(name)) return;
    const service = findStackService(config, name);
    for (const dependency of service.dependsOn ?? []) {
      await startOne(dependency);
    }
    if (options.print) console.log(`  ${service.name.padEnd(14)} starting...`);
    await upService(config, service);
    const healthy = await waitForHealth(service.healthCheck, undefined, {
      runCommand: async (command) => {
        try {
          await execServiceCommand(config, service, command);
          return true;
        } catch {
          return false;
        }
      }
    });
    if (!healthy) throw kibacoError(await serviceHealthErrorMessage(config, service), 5);
    if (options.print) console.log(`  ${service.name.padEnd(14)} healthy`);
    started.add(name);
  };

  for (const name of serviceNames) {
    await startOne(name);
  }
}

export async function startProjectServices(config: ServiceStackConfig & { projects: Array<{ services?: string[] }> }, options: { print?: boolean } = {}) {
  const serviceNames = [...new Set(config.projects.flatMap((project) => project.services ?? []))];
  await startServices(config, serviceNames, options);
}

export async function stopServices(config: ServiceStackConfig, serviceNames: string[]) {
  for (const name of serviceNames) {
    await downService(config, findStackService(config, name));
  }
}

export async function getServiceStatuses(config: ServiceStackConfig): Promise<ServiceStatusRow[]> {
  return Promise.all(
    config.services.map(async (service) => ({
      name: service.name,
      image: service.image,
      container: containerName(config, service),
      running: await serviceRunning(config, service),
      ports: service.ports ?? []
    }))
  );
}

export async function showServiceLogs(config: ServiceStackConfig, serviceName: string, options: { follow?: boolean; tail?: number } = {}) {
  await serviceLogs(config, findStackService(config, serviceName), options);
}

async function serviceHealthErrorMessage(config: ServiceStackConfig, service: ServiceConfig) {
  const name = containerName(config, service);
  const lines = [
    `Service health check failed: ${service.name}`,
    `Container: ${name}`,
    "",
    "Inspect with:",
    `  kibaco services logs ${service.name}`,
    `  docker logs ${name}`
  ];

  if (service.healthCheck?.type === "command" && service.healthCheck.command) {
    lines.push("", `Health check command: ${service.healthCheck.command}`);
  }

  const logs = await serviceLogTail(config, service, 80);
  if (logs) {
    lines.push("", "Recent Docker logs:", logs);
  }

  return lines.join("\n");
}
