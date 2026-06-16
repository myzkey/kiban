import path from "node:path";
import fs from "fs-extra";
import YAML from "yaml";
import {
  kibanConfigSchema,
  proxyConfigSchema,
  type KibanConfig,
  type ProjectConfig,
  type ProxyConfig,
  type ProxyProjectConfig,
  type ServiceConfig
} from "./types.js";
import { expandHome } from "./paths.js";

export class ConfigError extends Error {
  code = 2;
}

export async function findConfig(startDir = process.cwd()): Promise<string | null> {
  let current = path.resolve(startDir);
  while (true) {
    const candidate = path.join(current, "kiban.yml");
    if (await fs.pathExists(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  const homeConfig = expandHome("~/.kiban/kiban.yml");
  return (await fs.pathExists(homeConfig)) ? homeConfig : null;
}

export async function findProxyConfig(startDir = process.cwd()): Promise<string | null> {
  let current = path.resolve(startDir);
  while (true) {
    const candidate = path.join(current, "kiban.config.json");
    if (await fs.pathExists(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

export async function loadConfig(startDir = process.cwd()): Promise<{ path: string; config: KibanConfig }> {
  const configPath = await findConfig(startDir);
  if (!configPath) throw new ConfigError("kiban.yml not found. Run `kiban init` first.");

  const raw = await fs.readFile(configPath, "utf8");
  const parsed = YAML.parse(raw) ?? {};
  const result = kibanConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw new ConfigError(`Invalid kiban.yml: ${result.error.issues.map((issue) => issue.message).join(", ")}`);
  }

  return { path: configPath, config: normalizeConfig(result.data) };
}

export async function loadProxyConfig(startDir = process.cwd()): Promise<{ path: string; config: ProxyConfig }> {
  const configPath = await findProxyConfig(startDir);
  if (!configPath) throw new ConfigError("kiban.config.json not found. Run `kiban init` first.");

  const raw = await fs.readFile(configPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const result = proxyConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw new ConfigError(`Invalid kiban.config.json: ${result.error.issues.map((issue) => issue.message).join(", ")}`);
  }

  return { path: configPath, config: normalizeProxyConfig(result.data, path.dirname(configPath)) };
}

export function normalizeConfig(config: KibanConfig): KibanConfig {
  return {
    ...config,
    projects: config.projects.map((project) => ({
      ...project,
      path: expandHome(project.path)
    }))
  };
}

export function normalizeProxyConfig(config: ProxyConfig, baseDir = process.cwd()): ProxyConfig {
  return {
    ...config,
    projects: config.projects.map((project) => ({
      ...project,
      cwd: path.resolve(baseDir, expandHome(project.cwd))
    }))
  };
}

export async function writeInitialConfig(targetPath = path.join(process.cwd(), "kiban.yml")) {
  if (await fs.pathExists(targetPath)) {
    throw new ConfigError("kiban.yml already exists. Refusing to overwrite it.");
  }

  const content = YAML.stringify({
    workspace: "default",
    projects: [],
    services: []
  });
  await fs.writeFile(targetPath, content);
  return targetPath;
}

export async function writeInitialProxyConfig(targetPath = path.join(process.cwd(), "kiban.config.json")) {
  if (await fs.pathExists(targetPath)) {
    throw new ConfigError("kiban.config.json already exists. Refusing to overwrite it.");
  }

  const content = {
    workspace: "default",
    proxyPort: 8080,
    services: [],
    projects: [
      {
        name: "web",
        host: "web.localhost",
        target: "http://localhost:3000",
        command: "pnpm dev",
        cwd: ".",
        services: []
      }
    ]
  };
  await fs.writeJson(targetPath, content, { spaces: 2 });
  return targetPath;
}

export async function saveConfig(configPath: string, config: KibanConfig) {
  await fs.writeFile(configPath, YAML.stringify(config));
}

export function findProject(config: KibanConfig, name: string): ProjectConfig {
  const project = config.projects.find((item) => item.name === name);
  if (!project) {
    const error = new Error(`Project not found: ${name}`) as Error & { code: number };
    error.code = 6;
    throw error;
  }
  return project;
}

export function findProxyProject(config: ProxyConfig, name: string): ProxyProjectConfig {
  const project = config.projects.find((item) => item.name === name);
  if (!project) {
    const error = new Error(`Project not found: ${name}`) as Error & { code: number };
    error.code = 6;
    throw error;
  }
  return project;
}

export function findProxyService(config: ProxyConfig, name: string): ServiceConfig {
  const service = config.services.find((item) => item.name === name);
  if (!service) {
    const error = new Error(`Service not found: ${name}`) as Error & { code: number };
    error.code = 7;
    throw error;
  }
  return service;
}

export function findService(config: KibanConfig, name: string): ServiceConfig {
  const service = config.services.find((item) => item.name === name);
  if (!service) {
    const error = new Error(`Service not found: ${name}`) as Error & { code: number };
    error.code = 7;
    throw error;
  }
  return service;
}
