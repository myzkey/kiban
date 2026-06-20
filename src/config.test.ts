import path from "node:path";
import os from "node:os";
import fs from "fs-extra";
import { afterEach, describe, expect, it, vi } from "vitest";
import { proxyConfigSchema } from "./types.js";
import { buildInitialProxyConfig, findProxyConfig, loadProxyConfig, normalizeProxyConfig, writeInitialProxyConfig } from "./config.js";

vi.mock("./ports.js", async () => {
  const actual = await vi.importActual<typeof import("./ports.js")>("./ports.js");
  return {
    ...actual,
    isPortAvailable: vi.fn().mockResolvedValue(true)
  };
});

describe("kibaco config", () => {
  const originalKibacoHome = process.env.KIBACO_HOME;

  afterEach(() => {
    if (originalKibacoHome === undefined) delete process.env.KIBACO_HOME;
    else process.env.KIBACO_HOME = originalKibacoHome;
  });

  it("parses a minimal proxy config", () => {
    const config = proxyConfigSchema.parse({});
    expect(config.workspace).toBe("default");
    expect(config.proxyPort).toBe(8080);
    expect(config.projects).toEqual([]);
    expect(config.services).toEqual([]);
  });

  it("resolves proxy project cwd relative to the config directory", () => {
    const config = normalizeProxyConfig(
      proxyConfigSchema.parse({
        projects: [
          {
            name: "web",
            host: "web.localhost",
            target: "http://localhost:3000",
            command: "pnpm dev",
            cwd: "apps/web"
          }
        ]
      }),
      "/repo"
    );

    expect(config.projects[0]?.cwd).toBe(path.resolve("/repo/apps/web"));
  });

  it("builds an initial proxy config from answers", async () => {
    const config = await buildInitialProxyConfig({
      workspace: "demo",
      proxyPort: 30080,
      projectName: "api",
      host: "api.localhost",
      target: "http://localhost:8787",
      command: "pnpm dev:api",
      cwd: "apps/api"
    });

    expect(config.workspace).toBe("demo");
    expect(config.proxyPort).toBe(30080);
    expect(config.projects[0]).toEqual(
      expect.objectContaining({
        name: "api",
        host: "api.localhost",
        target: "http://localhost:8787",
        command: "pnpm dev:api",
        cwd: "apps/api"
      })
    );
  });

  it("infers defaults from a local server file", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "kibaco-infer-"));
    await fs.writeFile(
      path.join(root, "server.mjs"),
      'server.listen(Number(process.env.PORT ?? 43110), "127.0.0.1");\n'
    );

    const config = await buildInitialProxyConfig({}, root);

    expect(config.workspace).toBe(path.basename(root));
    expect(config.projects[0]).toEqual(
      expect.objectContaining({
        name: "web",
        host: "web.localhost",
        target: "http://localhost:43110",
        command: "node server.mjs",
        cwd: "."
      })
    );
  });

  it("infers defaults from package scripts", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "kibaco-infer-"));
    await fs.writeFile(path.join(root, "pnpm-lock.yaml"), "");
    await fs.writeJson(path.join(root, "package.json"), {
      name: "@demo/admin-app",
      scripts: {
        dev: "vite --host 127.0.0.1"
      }
    });

    const config = await buildInitialProxyConfig({}, root);

    expect(config.projects[0]).toEqual(
      expect.objectContaining({
        name: "admin-app",
        host: "admin-app.localhost",
        target: "http://localhost:5173",
        command: "pnpm dev"
      })
    );
  });

  it("infers package manager, framework command, and port from env files", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "kibaco-env-"));
    await fs.writeFile(path.join(root, "bun.lock"), "");
    await fs.writeJson(path.join(root, "package.json"), {
      name: "studio",
      dependencies: {
        vite: "^6.0.0"
      }
    });
    await fs.writeFile(path.join(root, ".env.development"), "PORT=6123\n");

    const config = await buildInitialProxyConfig({}, root);

    expect(config.projects[0]).toEqual(
      expect.objectContaining({
        name: "studio",
        host: "studio.localhost",
        target: "http://localhost:6123",
        command: "bun vite --host 127.0.0.1"
      })
    );
  });

  it("selects a proxy port that does not conflict with inferred project targets", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "kibaco-proxy-port-"));
    await fs.writeJson(path.join(root, "package.json"), {
      name: "api",
      scripts: {
        dev: "node server.js"
      }
    });
    await fs.writeFile(path.join(root, "server.js"), "server.listen(8080)\n");

    const config = await buildInitialProxyConfig({}, root);

    expect(config.projects[0]?.target).toBe("http://localhost:8080");
    expect(config.proxyPort).toBe(18080);
  });

  it("keeps an explicitly requested proxy port", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "kibaco-explicit-proxy-port-"));
    await fs.writeJson(path.join(root, "package.json"), {
      name: "api",
      scripts: {
        dev: "node server.js"
      }
    });
    await fs.writeFile(path.join(root, "server.js"), "server.listen(8080)\n");

    const config = await buildInitialProxyConfig({ proxyPort: 8080 }, root);

    expect(config.proxyPort).toBe(8080);
  });

  it("infers backend commands", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "kibaco-backend-"));
    await fs.writeFile(path.join(root, "Gemfile"), "gem 'rails'\n");
    await fs.ensureDir(path.join(root, "config"));
    await fs.writeFile(path.join(root, "config", "puma.rb"), 'port ENV.fetch("PORT") { 4010 }\n');

    const config = await buildInitialProxyConfig({}, root);

    expect(config.projects[0]).toEqual(
      expect.objectContaining({
        name: path.basename(root),
        target: "http://localhost:4010",
        command: "bin/rails server"
      })
    );
  });

  it("infers multiple projects from monorepo app folders", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "kibaco-monorepo-"));
    await fs.writeFile(path.join(root, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n");
    await fs.writeFile(path.join(root, "pnpm-lock.yaml"), "");
    await fs.ensureDir(path.join(root, "apps", "web"));
    await fs.ensureDir(path.join(root, "apps", "api"));
    await fs.writeJson(path.join(root, "apps", "web", "package.json"), {
      name: "web",
      scripts: { dev: "next dev" }
    });
    await fs.writeJson(path.join(root, "apps", "api", "package.json"), {
      name: "api",
      scripts: { "dev:api": "vite --host 127.0.0.1" }
    });

    const config = await buildInitialProxyConfig({}, root);

    expect(config.projects).toEqual([
      expect.objectContaining({
        name: "api",
        cwd: "apps/api",
        command: "pnpm dev:api",
        target: "http://localhost:5173"
      }),
      expect.objectContaining({
        name: "web",
        cwd: "apps/web",
        command: "pnpm dev",
        target: "http://localhost:3000"
      })
    ]);
  });

  it("infers services from compose files", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "kibaco-compose-"));
    await fs.writeJson(path.join(root, "package.json"), {
      name: "with-db",
      scripts: {
        dev: "next dev"
      }
    });
    await fs.writeFile(
      path.join(root, "compose.yaml"),
      [
        "services:",
        "  postgres:",
        "    image: postgres:16",
        "    ports:",
        '      - "5432:5432"',
        "    environment:",
        "      POSTGRES_PASSWORD: postgres",
        "      POSTGRES_DB: app",
        "    volumes:",
        "      - pgdata:/var/lib/postgresql/data",
        "    healthcheck:",
        '      test: ["CMD", "pg_isready", "-U", "postgres"]',
        "  redis:",
        "    image: redis:7",
        "    ports:",
        "      - target: 6379",
        "        published: 6379",
        "    depends_on:",
        "      postgres:",
        "        condition: service_healthy"
      ].join("\n")
    );

    const config = await buildInitialProxyConfig({}, root);

    expect(config.services).toEqual([
      expect.objectContaining({
        name: "postgres",
        image: "postgres:16",
        ports: ["5432:5432"],
        env: {
          POSTGRES_PASSWORD: "postgres",
          POSTGRES_DB: "app"
        },
        composeFile: path.join(root, "compose.yaml"),
        volumes: ["pgdata:/var/lib/postgresql/data"],
        dependsOn: [],
        healthCheck: expect.objectContaining({
          type: "command",
          command: "pg_isready -U postgres"
        })
      }),
      expect.objectContaining({
        name: "redis",
        image: "redis:7",
        composeFile: path.join(root, "compose.yaml"),
        ports: ["6379:6379"],
        dependsOn: ["postgres"]
      })
    ]);
    expect(config.projects[0]?.services).toEqual(["postgres", "redis"]);
  });

  it("keeps inferred monorepo projects when answers only contain undefined values", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "kibaco-monorepo-undefined-"));
    await fs.writeFile(path.join(root, "pnpm-workspace.yaml"), ['packages:', '  - "apps/*"'].join("\n"));
    await fs.ensureDir(path.join(root, "apps", "frontend"));
    await fs.ensureDir(path.join(root, "apps", "backend"));
    await fs.writeJson(path.join(root, "apps", "frontend", "package.json"), {
      name: "frontend",
      scripts: {
        dev: "vite"
      },
      dependencies: {
        vite: "^5.0.0"
      }
    });
    await fs.writeJson(path.join(root, "apps", "backend", "package.json"), {
      name: "backend",
      scripts: {
        dev: "nest start --watch"
      }
    });
    await fs.ensureDir(path.join(root, "packages", "api-client"));
    await fs.writeJson(path.join(root, "packages", "api-client", "package.json"), {
      name: "api-client",
      scripts: {
        build: "tsc"
      }
    });

    const config = await buildInitialProxyConfig(
      {
        workspace: undefined,
        proxyPort: undefined,
        projectName: undefined,
        host: undefined,
        target: undefined,
        command: undefined,
        cwd: undefined
      },
      root
    );

    expect(config.projects.map((project) => project.name).sort()).toEqual(["backend", "frontend"]);
  });

  it("keeps inferred monorepo projects when only workspace options are overridden", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "kibaco-monorepo-proxy-port-"));
    await fs.writeFile(path.join(root, "pnpm-workspace.yaml"), ['packages:', '  - "apps/*"'].join("\n"));
    await fs.ensureDir(path.join(root, "apps", "frontend"));
    await fs.ensureDir(path.join(root, "apps", "backend"));
    await fs.writeJson(path.join(root, "apps", "frontend", "package.json"), {
      name: "frontend",
      scripts: {
        dev: "vite"
      },
      dependencies: {
        vite: "^5.0.0"
      }
    });
    await fs.writeJson(path.join(root, "apps", "backend", "package.json"), {
      name: "backend",
      scripts: {
        dev: "nest start --watch"
      }
    });

    const config = await buildInitialProxyConfig({ proxyPort: 18080 }, root);

    expect(config.proxyPort).toBe(18080);
    expect(config.projects.map((project) => project.name).sort()).toEqual(["backend", "frontend"]);
  });

  it("infers service health checks and project dependencies from compose and env", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "kibaco-compose-health-"));
    await fs.writeJson(path.join(root, "package.json"), {
      name: "with-urls",
      scripts: {
        dev: "next dev"
      }
    });
    await fs.writeFile(path.join(root, ".env.local"), "DATABASE_URL=postgres://postgres:postgres@localhost:5432/app\nREDIS_URL=redis://localhost:6379\n");
    await fs.writeFile(
      path.join(root, "docker-compose.yml"),
      [
        "services:",
        "  postgres:",
        "    image: postgres:16",
        "    ports:",
        '      - "5432:5432"',
        "  redis:",
        "    image: redis:7",
        "    ports:",
        '      - "6379:6379"',
        "  mailpit:",
        "    image: axllent/mailpit:latest",
        "    ports:",
        '      - "8025:8025"'
      ].join("\n")
    );

    const config = await buildInitialProxyConfig({}, root);

    expect(config.services).toEqual([
      expect.objectContaining({
        name: "postgres",
        composeFile: path.join(root, "docker-compose.yml"),
        healthCheck: expect.objectContaining({ type: "tcp", port: 5432 })
      }),
      expect.objectContaining({
        name: "redis",
        composeFile: path.join(root, "docker-compose.yml"),
        healthCheck: expect.objectContaining({ type: "tcp", port: 6379 })
      }),
      expect.objectContaining({
        name: "mailpit",
        composeFile: path.join(root, "docker-compose.yml"),
        healthCheck: expect.objectContaining({ type: "http", url: "http://127.0.0.1:8025" })
      })
    ]);
    expect(config.projects[0]?.services).toEqual(["postgres", "redis"]);
  });

  it("stores workspace config outside the project and resolves from child directories", async () => {
    process.env.KIBACO_HOME = await fs.mkdtemp(path.join(os.tmpdir(), "kibaco-home-"));
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "kibaco-config-"));
    const nested = path.join(root, "apps", "web");
    await fs.ensureDir(nested);
    const configPath = await writeInitialProxyConfig(
      undefined,
      {
        workspace: "demo",
        proxyPort: 8088,
        projectName: "web",
        host: "web.localhost",
        target: "http://localhost:3000",
        command: "pnpm dev",
        cwd: "apps/web"
      },
      root
    );
    await fs.writeJson(configPath, {
      workspace: "demo",
      proxyPort: 8088,
      services: [],
      projects: [
        {
          name: "web",
          host: "web.localhost",
          target: "http://localhost:3000",
          command: "pnpm dev",
          cwd: "apps/web"
        }
      ]
    });

    await expect(fs.pathExists(path.join(root, "kibaco.config.json"))).resolves.toBe(false);
    await expect(findProxyConfig(nested)).resolves.toBe(configPath);
    const loaded = await loadProxyConfig(nested);
    expect(loaded.config.workspace).toBe("demo");
    await expect(fs.realpath(loaded.config.projects[0]?.cwd ?? "")).resolves.toBe(await fs.realpath(nested));
  });
});
