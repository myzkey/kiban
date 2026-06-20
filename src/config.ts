import path from "node:path";
import crypto from "node:crypto";
import readline from "node:readline/promises";
import fs from "fs-extra";
import YAML from "yaml";
import { proxyConfigSchema, type ProxyConfig, type ProxyProjectConfig, type ServiceConfig } from "./types.js";
import { ensureKibacoDirs, expandHome, workspaceIndexFile, workspacesDir } from "./paths.js";
import { isPortAvailable } from "./ports.js";
import { targetPort } from "./proxy.js";

export class ConfigError extends Error {
  code = 2;
}

type WorkspaceIndex = {
  workspaces: Array<{
    root: string;
    configPath: string;
    workspace: string;
  }>;
};

export async function findProxyConfig(startDir = process.cwd()): Promise<string | null> {
  return (await findProxyWorkspace(startDir))?.configPath ?? null;
}

export async function loadProxyConfig(startDir = process.cwd()): Promise<{ path: string; config: ProxyConfig }> {
  const workspace = await findProxyWorkspace(startDir);
  if (!workspace) throw new ConfigError("Kibaco workspace not found. Run `kibaco init` from the workspace root first.");

  const raw = await fs.readFile(workspace.configPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const result = proxyConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw new ConfigError(`Invalid Kibaco workspace config: ${result.error.issues.map((issue) => issue.message).join(", ")}`);
  }

  return { path: workspace.configPath, config: normalizeProxyConfig(result.data, workspace.root) };
}

export function normalizeProxyConfig(config: ProxyConfig, baseDir = process.cwd()): ProxyConfig {
  return {
    ...config,
    services: attachComposeFiles(
      config.services.map((service) => ({
        ...service,
        composeFile: service.composeFile ? path.resolve(baseDir, expandHome(service.composeFile)) : service.composeFile
      })),
      baseDir
    ),
    projects: config.projects.map((project) => ({
      ...project,
      cwd: path.resolve(baseDir, expandHome(project.cwd))
    }))
  };
}

export type InitialProxyConfigAnswers = {
  workspace?: string;
  proxyPort?: number;
  projectName?: string;
  host?: string;
  target?: string;
  command?: string;
  cwd?: string;
};

type BuildInitialProxyConfigOptions = {
  interactive?: boolean;
  force?: boolean;
};

type PackageJson = {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

type InferredProject = {
  name: string;
  host: string;
  target: string;
  command: string;
  cwd: string;
  services: string[];
};

export async function writeInitialProxyConfig(_targetPath?: string, answers: InitialProxyConfigAnswers = {}, rootDir = process.cwd(), options: BuildInitialProxyConfigOptions = {}) {
  const root = await resolveWorkspaceRoot(rootDir);
  const existing = await findProxyWorkspace(root);
  if (existing?.root === root && !options.force) throw new ConfigError(`Kibaco workspace already exists for ${root}.`);

  const config = await buildInitialProxyConfig(answers, root, options);
  const configPath = existing?.root === root ? existing.configPath : workspaceConfigPath(root, config.workspace);
  await fs.ensureDir(path.dirname(configPath));
  await fs.writeJson(configPath, config, { spaces: 2 });
  await registerProxyWorkspace({ root, configPath, workspace: config.workspace });
  return configPath;
}

export async function buildInitialProxyConfig(answers: InitialProxyConfigAnswers = {}, rootDir = process.cwd(), options: BuildInitialProxyConfigOptions = {}): Promise<ProxyConfig> {
  const defaults = await inferInitialProxyConfigDefaults(rootDir);
  const inferredServices = await inferComposeServices(rootDir);
  const inferredProjects = await inferProjects(rootDir, inferredServices);
  const providedAnswers = stripUndefinedAnswers(answers);

  const shouldPrompt = options.interactive ?? (process.stdin.isTTY && process.stdout.isTTY && Object.keys(providedAnswers).length === 0);
  const resolved = shouldPrompt ? await askInitialProxyConfig({ ...defaults, ...providedAnswers }) : providedAnswers;
  const hasProjectOverride = ["projectName", "host", "target", "command", "cwd"].some((key) => key in providedAnswers);
  const projects =
    !hasProjectOverride
      ? inferredProjects
      : [
          {
            name: resolved.projectName ?? defaults.projectName,
            host: resolved.host ?? defaults.host,
            target: resolved.target ?? defaults.target,
            command: resolved.command ?? defaults.command,
            cwd: resolved.cwd ?? defaults.cwd,
            services: inferredServices.map((service) => service.name)
          }
        ];
  const proxyPort = await resolveProxyPort(resolved.proxyPort ?? defaults.proxyPort, {
    explicit: resolved.proxyPort !== undefined,
    projects
  });
  return proxyConfigSchema.parse({
    workspace: resolved.workspace ?? defaults.workspace,
    proxyPort,
    services: inferredServices,
    projects
  });
}

async function resolveProxyPort(preferredPort: number, options: { explicit: boolean; projects: InferredProject[] }) {
  if (options.explicit) return preferredPort;
  const targetPorts = new Set(options.projects.map((project) => targetPort(project.target)).filter((port): port is number => Boolean(port)));
  for (const port of candidateProxyPorts(preferredPort)) {
    if (targetPorts.has(port)) continue;
    if (await isPortAvailable(port, "127.0.0.1")) return port;
  }
  return preferredPort;
}

function candidateProxyPorts(preferredPort: number) {
  return [preferredPort, ...Array.from({ length: 100 }, (_, index) => 18080 + index)];
}

function stripUndefinedAnswers(answers: InitialProxyConfigAnswers): Partial<Required<InitialProxyConfigAnswers>> {
  return Object.fromEntries(Object.entries(answers).filter(([, value]) => value !== undefined)) as Partial<Required<InitialProxyConfigAnswers>>;
}

async function inferInitialProxyConfigDefaults(rootDir: string): Promise<Required<InitialProxyConfigAnswers>> {
  const root = path.resolve(rootDir);
  const workspace = path.basename(root) || "default";
  const packageJson = await readPackageJson(root);
  const command = await inferCommand(root, packageJson);
  const projectName = inferProjectName(packageJson);
  const port = await inferTargetPort(root, command);

  return {
    workspace,
    proxyPort: 8080,
    projectName,
    host: `${projectName}.localhost`,
    target: `http://localhost:${port}`,
    command,
    cwd: "."
  };
}

async function readPackageJson(root: string) {
  try {
    return (await fs.readJson(path.join(root, "package.json"))) as PackageJson;
  } catch {
    return null;
  }
}

async function inferProjects(rootDir: string, services: ServiceConfig[]): Promise<InferredProject[]> {
  const root = path.resolve(rootDir);
  const candidates = await findProjectRoots(root);
  const projects = await Promise.all(candidates.map((candidate) => inferProject(root, candidate, services)));
  return projects.length > 0 ? projects : [await inferProject(root, root, services)];
}

async function inferProject(workspaceRoot: string, projectRoot: string, services: ServiceConfig[]): Promise<InferredProject> {
  const packageJson = await readPackageJson(projectRoot);
  const command = await inferCommand(projectRoot, packageJson);
  const projectName = inferProjectName(packageJson, inferProjectNameFallback(projectRoot));
  const port = await inferTargetPort(projectRoot, command);
  return {
    name: projectName,
    host: `${projectName}.localhost`,
    target: `http://localhost:${port}`,
    command,
    cwd: relativeCwd(workspaceRoot, projectRoot),
    services: inferProjectServices(projectRoot, services)
  };
}

function inferProjectNameFallback(projectRoot: string) {
  if (fs.existsSync(path.join(projectRoot, "server.mjs")) || fs.existsSync(path.join(projectRoot, "server.js"))) return "web";
  return path.basename(projectRoot);
}

async function findProjectRoots(root: string) {
  if (!(await isMonorepoRoot(root))) return [root];
  const appRoots = await findProjectRootsUnder(root, "apps");
  if (appRoots.length > 0) return appRoots.sort();
  const patterns = ["packages", "services"];
  const roots: string[] = [];
  for (const directory of patterns) {
    roots.push(...(await findProjectRootsUnder(root, directory)));
  }
  return roots.length > 0 ? roots.sort() : [root];
}

async function findProjectRootsUnder(root: string, directory: string) {
  const parent = path.join(root, directory);
  if (!(await fs.pathExists(parent))) return [];
  const roots: string[] = [];
  for (const entry of await fs.readdir(parent, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(parent, entry.name);
    if (await looksLikeProjectRoot(candidate)) roots.push(candidate);
  }
  return roots;
}

async function isMonorepoRoot(root: string) {
  return (
    (await fs.pathExists(path.join(root, "pnpm-workspace.yaml"))) ||
    (await fs.pathExists(path.join(root, "turbo.json"))) ||
    (await fs.pathExists(path.join(root, "nx.json"))) ||
    (await fs.pathExists(path.join(root, "lerna.json")))
  );
}

async function looksLikeProjectRoot(root: string) {
  const packageJson = await readPackageJson(root);
  if (packageJson && looksLikeRunnablePackage(packageJson)) return true;
  for (const fileName of ["Gemfile", "composer.json", "manage.py", "pyproject.toml", "go.mod", "Cargo.toml", "main.go", "server.mjs", "server.js"]) {
    if (await fs.pathExists(path.join(root, fileName))) return true;
  }
  return false;
}

function looksLikeRunnablePackage(packageJson: PackageJson) {
  const scripts = packageJson.scripts ?? {};
  if (commandScriptNames.some((script) => Boolean(scripts[script]))) return true;
  return Boolean(inferFrameworkCommand("pnpm", packageJson));
}

const commandScriptNames = ["dev", "dev:web", "dev:api", "start:dev", "serve", "preview"];

async function inferCommand(root: string, packageJson: PackageJson | null) {
  const packageManager = await inferPackageManager(root);
  const scripts = packageJson?.scripts ?? {};
  for (const script of commandScriptNames) {
    if (scripts[script]) return packageScriptCommand(packageManager, script);
  }
  const frameworkCommand = inferFrameworkCommand(packageManager, packageJson);
  if (frameworkCommand) return frameworkCommand;
  if (fs.existsSync(path.join(root, "server.mjs"))) return "node server.mjs";
  if (fs.existsSync(path.join(root, "server.js"))) return "node server.js";
  if (fs.existsSync(path.join(root, "Gemfile")) || fs.existsSync(path.join(root, "bin", "rails"))) return "bin/rails server";
  if (fs.existsSync(path.join(root, "artisan"))) return "php artisan serve";
  if (fs.existsSync(path.join(root, "manage.py"))) return "python manage.py runserver";
  if (fs.existsSync(path.join(root, "go.mod")) || fs.existsSync(path.join(root, "main.go"))) return "go run .";
  if (fs.existsSync(path.join(root, "Cargo.toml"))) return "cargo run";
  return `${packageManager} dev`;
}

async function inferPackageManager(root: string) {
  let directory = path.resolve(root);
  while (true) {
    if (await fs.pathExists(path.join(directory, "pnpm-lock.yaml"))) return "pnpm";
    if ((await fs.pathExists(path.join(directory, "bun.lock"))) || (await fs.pathExists(path.join(directory, "bun.lockb")))) return "bun";
    if (await fs.pathExists(path.join(directory, "yarn.lock"))) return "yarn";
    if (await fs.pathExists(path.join(directory, "package-lock.json"))) return "npm";
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return "pnpm";
}

function packageScriptCommand(packageManager: string, script: string) {
  return packageManager === "npm" ? `npm run ${script}` : `${packageManager} ${script}`;
}

function inferFrameworkCommand(packageManager: string, packageJson: PackageJson | null) {
  const deps = { ...(packageJson?.dependencies ?? {}), ...(packageJson?.devDependencies ?? {}) };
  if (deps.next) return `${packageManager} next dev`;
  if (deps.vite) return `${packageManager} vite --host 127.0.0.1`;
  if (deps.astro) return `${packageManager} astro dev`;
  if (deps.nuxt) return `${packageManager} nuxt dev`;
  if (deps["@remix-run/dev"]) return `${packageManager} remix dev`;
  return null;
}

function inferProjectName(packageJson: { name?: string } | null, fallback = "web") {
  const rawName = packageJson?.name?.split("/").pop() ?? fallback;
  const name = rawName.replace(/[^a-zA-Z0-9-]/g, "-").replace(/^-+|-+$/g, "");
  return name || "web";
}

async function inferTargetPort(root: string, command: string) {
  const packageJson = await readPackageJson(root);
  const env = await readEnvFiles(root);
  const scripts = packageJson?.scripts ?? {};
  const startupScripts = [...commandScriptNames, "start"].flatMap((script) => (scripts[script] ? [scripts[script]] : []));
  const commandText = [
    command,
    startupScripts.join("\n"),
    Object.entries(env)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n"),
    await readIfExists(path.join(root, "server.mjs")),
    await readIfExists(path.join(root, "server.js")),
    await readIfExists(path.join(root, "src", "main.ts")),
    await readIfExists(path.join(root, "src", "index.ts")),
    await readIfExists(path.join(root, "config", "puma.rb")),
    await readIfExists(path.join(root, "vite.config.ts")),
    await readIfExists(path.join(root, "vite.config.js"))
  ].join("\n");

  const envPort = commandText.match(/\b(?:PORT|VITE_PORT)\s*=\s*(\d{2,5})\b/);
  if (envPort) return Number(envPort[1]);

  const fallbackEnvPort = commandText.match(/process\.env\.PORT\s*(?:\?\?|\|\|)\s*['"`]?(\d{2,5})['"`]?/);
  if (fallbackEnvPort) return Number(fallbackEnvPort[1]);

  const listenPort = commandText.match(/listen\(\s*(?:Number\(process\.env\.PORT\s*\?\?\s*)?['"`]?(\d{2,5})['"`]?/);
  if (listenPort) return Number(listenPort[1]);

  const railsPort = commandText.match(/\bport\s+ENV\.fetch\(["']PORT["']\)\s*\{\s*(\d{2,5})\s*\}/);
  if (railsPort) return Number(railsPort[1]);

  if (/\b(nuxt)\b/.test(commandText)) return 3000;
  if (/\b(vite|vite\s+)/.test(commandText)) return 5173;
  if (/\b(astro)\b/.test(commandText)) return 4321;
  if (/\b(next|next\s+dev)\b/.test(commandText)) return 3000;
  if (/\b(remix|react-router)\b/.test(commandText)) return 5173;
  if (/\b(php artisan serve)\b/.test(commandText)) return 8000;
  if (/\b(python manage\.py runserver)\b/.test(commandText)) return 8000;
  return 3000;
}

async function readEnvFiles(root: string) {
  const env: Record<string, string> = {};
  for (const fileName of [".env", ".env.local", ".env.development", ".env.development.local"]) {
    const text = await readIfExists(path.join(root, fileName));
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  }
  return env;
}

function inferProjectServices(projectRoot: string, services: ServiceConfig[]) {
  if (services.length === 0) return [];
  const envText = [
    fs.existsSync(path.join(projectRoot, ".env")) ? fs.readFileSync(path.join(projectRoot, ".env"), "utf8") : "",
    fs.existsSync(path.join(projectRoot, ".env.local")) ? fs.readFileSync(path.join(projectRoot, ".env.local"), "utf8") : "",
    fs.existsSync(path.join(projectRoot, ".env.development")) ? fs.readFileSync(path.join(projectRoot, ".env.development"), "utf8") : ""
  ].join("\n");
  const matched = services.filter((service) => {
    const haystack = `${service.name}\n${service.image}\n${service.ports.join("\n")}`.toLowerCase();
    const text = envText.toLowerCase();
    if (text.includes(service.name.toLowerCase())) return true;
    if (/database_url|postgres|mysql/.test(text) && /(postgres|mysql|mariadb)/.test(haystack)) return true;
    if (/redis_url|redis/.test(text) && /redis/.test(haystack)) return true;
    return false;
  });
  return matched.length > 0 ? matched.map((service) => service.name) : services.map((service) => service.name);
}

function relativeCwd(workspaceRoot: string, projectRoot: string) {
  const relative = path.relative(workspaceRoot, projectRoot);
  return relative.length > 0 ? relative : ".";
}

async function readIfExists(filePath: string) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

async function inferComposeServices(rootDir: string) {
  const composePath = await findComposeFile(rootDir);
  if (!composePath) return [];

  const parsed = YAML.parse(await fs.readFile(composePath, "utf8")) as unknown;
  if (!isRecord(parsed) || !isRecord(parsed.services)) return [];

  return Object.entries(parsed.services)
    .flatMap(([name, value]) => {
      if (!isRecord(value) || typeof value.image !== "string") return [];
      return [
        {
          name,
          image: value.image,
          ports: normalizeComposeList(value.ports).map(String),
          env: normalizeComposeEnv(value.environment),
          volumes: normalizeComposeList(value.volumes).map(String),
          dependsOn: normalizeDependsOn(value.depends_on),
          composeFile: composePath,
          healthCheck: inferComposeHealthCheck(name, value.image, value.healthcheck, value.ports)
        }
      ];
    })
    .map((service) => removeUndefined(service));
}

async function findComposeFile(rootDir: string) {
  for (const fileName of ["compose.yaml", "compose.yml", "docker-compose.yaml", "docker-compose.yml", "docker.yaml", "docker.yml"]) {
    const candidate = path.join(rootDir, fileName);
    if (await fs.pathExists(candidate)) return candidate;
  }
  return null;
}

function attachComposeFiles(services: ServiceConfig[], rootDir: string) {
  const composePath = findComposeFileSync(rootDir);
  if (!composePath) return services;
  const serviceNames = readComposeServiceNames(composePath);
  if (serviceNames.size === 0) return services;
  return services.map((service) => (service.composeFile || !serviceNames.has(service.name) ? service : { ...service, composeFile: composePath }));
}

function findComposeFileSync(rootDir: string) {
  for (const fileName of ["compose.yaml", "compose.yml", "docker-compose.yaml", "docker-compose.yml", "docker.yaml", "docker.yml"]) {
    const candidate = path.join(rootDir, fileName);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function readComposeServiceNames(composePath: string) {
  try {
    const parsed = YAML.parse(fs.readFileSync(composePath, "utf8")) as unknown;
    if (!isRecord(parsed) || !isRecord(parsed.services)) return new Set<string>();
    return new Set(Object.keys(parsed.services));
  } catch {
    return new Set<string>();
  }
}

function normalizeComposeEnv(value: unknown) {
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, envValue]) => [key, String(envValue)]));
  }
  if (Array.isArray(value)) {
    return Object.fromEntries(
      value.flatMap((entry) => {
        const text = String(entry);
        const index = text.indexOf("=");
        return index === -1 ? [] : [[text.slice(0, index), text.slice(index + 1)]];
      })
    );
  }
  return {};
}

function normalizeDependsOn(value: unknown) {
  if (Array.isArray(value)) return value.map(String);
  if (isRecord(value)) return Object.keys(value);
  return [];
}

function normalizeComposeList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (isRecord(item) ? normalizeComposePortObject(item) : String(item))).filter((item) => item.length > 0);
}

function normalizeComposePortObject(port: Record<string, unknown>) {
  const published = port.published ?? port.host_port;
  const target = port.target ?? port.container_port;
  if (published && target) return `${published}:${target}`;
  if (target) return String(target);
  return "";
}

function inferComposeHealthCheck(name: string, image: string, value: unknown, ports: unknown) {
  const test = isRecord(value) ? normalizeComposeHealthCheckTest(value.test) : undefined;
  if (test) return { type: "command" as const, command: test };
  const imageName = `${name} ${image}`.toLowerCase();
  const inferredPort = firstPublishedPort(ports);
  if (/(postgres|mysql|mariadb|redis)/.test(imageName)) {
    return { type: "tcp" as const, host: "127.0.0.1", port: inferredPort ?? defaultServicePort(imageName) };
  }
  if (/(meilisearch|mailpit|mailhog)/.test(imageName)) {
    const port = inferredPort ?? defaultServicePort(imageName);
    return { type: "http" as const, url: `http://127.0.0.1:${port}` };
  }
  return undefined;
}

function normalizeComposeHealthCheckTest(value: unknown) {
  if (Array.isArray(value)) {
    const parts = value.map(String);
    const [kind, ...command] = parts;
    if (kind === "NONE") return undefined;
    if (kind === "CMD" || kind === "CMD-SHELL") return command.join(" ");
    return parts.join(" ");
  }
  if (typeof value !== "string") return undefined;
  return value.replace(/^(CMD|CMD-SHELL)\s+/, "");
}

function firstPublishedPort(ports: unknown) {
  const first = normalizeComposeList(ports)[0];
  if (!first) return undefined;
  const value = first.includes(":") ? first.split(":")[0] : first;
  const port = Number(value);
  return Number.isFinite(port) ? port : undefined;
}

function defaultServicePort(imageName: string) {
  if (imageName.includes("postgres")) return 5432;
  if (imageName.includes("mysql") || imageName.includes("mariadb")) return 3306;
  if (imageName.includes("redis")) return 6379;
  if (imageName.includes("meilisearch")) return 7700;
  if (imageName.includes("mailpit") || imageName.includes("mailhog")) return 8025;
  return 80;
}

function removeUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function defaultInitialProxyConfig(): ProxyConfig {
  const defaults = {
    workspace: "default",
    proxyPort: 8080,
    projectName: "web",
    host: "web.localhost",
    target: "http://localhost:3000",
    command: "pnpm dev",
    cwd: "."
  };
  return proxyConfigSchema.parse({
    workspace: defaults.workspace,
    proxyPort: defaults.proxyPort,
    services: [],
    projects: [
      {
        name: defaults.projectName,
        host: defaults.host,
        target: defaults.target,
        command: defaults.command,
        cwd: defaults.cwd,
        services: []
      }
    ]
  });
}

async function askInitialProxyConfig(defaults: Required<InitialProxyConfigAnswers>) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const ask = async (label: string, fallback: string) => {
      const value = (await rl.question(`${label} (${fallback}): `)).trim();
      return value || fallback;
    };
    const proxyPortValue = await ask("Proxy port", String(defaults.proxyPort));
    return {
      workspace: await ask("Workspace", defaults.workspace),
      proxyPort: Number(proxyPortValue),
      projectName: await ask("Project name", defaults.projectName),
      host: await ask("Host", defaults.host),
      target: await ask("Target URL", defaults.target),
      command: await ask("Command", defaults.command),
      cwd: await ask("Working directory", defaults.cwd)
    };
  } finally {
    rl.close();
  }
}

async function findProxyWorkspace(startDir = process.cwd()) {
  const current = await resolveWorkspaceRoot(startDir);
  const index = await readWorkspaceIndex();
  const matches = index.workspaces
    .filter((workspace) => current === workspace.root || current.startsWith(`${workspace.root}${path.sep}`))
    .sort((a, b) => b.root.length - a.root.length);
  for (const workspace of matches) {
    if (await fs.pathExists(workspace.configPath)) return workspace;
  }
  return null;
}

async function registerProxyWorkspace(entry: WorkspaceIndex["workspaces"][number]) {
  const index = await readWorkspaceIndex();
  const workspaces = [entry, ...index.workspaces.filter((workspace) => workspace.root !== entry.root)];
  await ensureKibacoDirs();
  await fs.writeJson(workspaceIndexFile(), { workspaces }, { spaces: 2 });
}

async function readWorkspaceIndex(): Promise<WorkspaceIndex> {
  await ensureKibacoDirs();
  if (!(await fs.pathExists(workspaceIndexFile()))) return { workspaces: [] };
  const raw = (await fs.readJson(workspaceIndexFile())) as Partial<WorkspaceIndex>;
  return {
    workspaces: (raw.workspaces ?? []).map((workspace) => ({
      root: path.resolve(workspace.root),
      configPath: path.resolve(workspace.configPath),
      workspace: workspace.workspace
    }))
  };
}

async function resolveWorkspaceRoot(value: string) {
  const resolved = path.resolve(value);
  try {
    return await fs.realpath(resolved);
  } catch {
    return resolved;
  }
}

function workspaceConfigPath(root: string, workspace: string) {
  const hash = crypto.createHash("sha1").update(root).digest("hex").slice(0, 10);
  const slug = workspace.replace(/[^a-zA-Z0-9_.-]/g, "-") || "default";
  return path.join(workspacesDir(), `${slug}-${hash}`, "config.json");
}

export function findProxyProject(config: ProxyConfig, name: string): ProxyProjectConfig {
  return findNamed(config.projects, name, "Project", 6);
}

export function findProxyService(config: ProxyConfig, name: string): ServiceConfig {
  return findNamed(config.services, name, "Service", 7);
}

function findNamed<T extends { name: string }>(items: T[], name: string, label: string, code: number): T {
  const item = items.find((entry) => entry.name === name);
  if (!item) {
    const error = new Error(`${label} not found: ${name}`) as Error & { code: number };
    error.code = code;
    throw error;
  }
  return item;
}
