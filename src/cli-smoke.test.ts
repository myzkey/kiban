import path from "node:path";
import os from "node:os";
import fs from "fs-extra";
import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerModernCommands } from "./commands/modern.js";
import { registerStackCommands } from "./commands/stack.js";
import { writeInitialProxyConfig } from "./config.js";
import { consumeRestartRequests } from "./restart.js";

describe("cli smoke", () => {
  const originalCwd = process.cwd();
  const originalKibacoHome = process.env.KIBACO_HOME;

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalKibacoHome === undefined) delete process.env.KIBACO_HOME;
    else process.env.KIBACO_HOME = originalKibacoHome;
    vi.restoreAllMocks();
  });

  it("prints list --json from the registered workspace config", async () => {
    const cwd = await fixtureDir();
    process.chdir(cwd);
    const output = await runModernCommand(["list", "--json"]);

    expect(JSON.parse(output)).toEqual(
      expect.objectContaining({
        proxyPort: 8080,
        projects: [
          expect.objectContaining({
            name: "web",
            host: "http://web.localhost:8080",
            target: "http://localhost:3000"
          })
        ]
      })
    );
  });

  it("prints services status --json", async () => {
    const cwd = await fixtureDir();
    process.chdir(cwd);
    const output = await runModernCommand(["services", "status", "--json"]);

    expect(JSON.parse(output)).toEqual({
      services: [
        expect.objectContaining({
          name: "postgres",
          image: "postgres:16",
          container: "kibaco-smoke-postgres",
          running: false
        })
      ]
    });
  });

  it("requests a project restart", async () => {
    const cwd = await fixtureDir();
    process.chdir(cwd);

    const output = await runModernCommand(["restart", "web"]);

    expect(output).toContain("Restart requested for web");
    await expect(consumeRestartRequests("smoke")).resolves.toEqual(["web"]);
  });

  it("requires an explicit logs target outside an interactive terminal", async () => {
    const cwd = await fixtureDir();
    process.chdir(cwd);

    await expect(runModernCommand(["logs"])).rejects.toThrow("Project or service name is required");
  });

  it("requires an interactive terminal for dev --select", async () => {
    const cwd = await fixtureDir();
    process.chdir(cwd);

    await expect(runModernCommand(["dev", "--select"])).rejects.toThrow("--select requires an interactive terminal");
  });

  it("prints inferred init config without writing when using init --detect", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "kibaco-detect-"));
    process.env.KIBACO_HOME = await fs.mkdtemp(path.join(os.tmpdir(), "kibaco-home-"));
    process.chdir(cwd);
    await fs.writeJson(path.join(cwd, "package.json"), {
      name: "detected",
      scripts: {
        dev: "vite --host 127.0.0.1"
      }
    });

    const output = await runModernCommand(["init", "--detect"]);

    expect(JSON.parse(output)).toEqual(
      expect.objectContaining({
        workspace: path.basename(cwd),
        projects: [
          expect.objectContaining({
            name: "detected",
            command: "pnpm dev",
            target: "http://localhost:5173"
          })
        ]
      })
    );
  });

  it("keeps old project-file commands out of the main help", () => {
    const program = new Command();
    registerModernCommands(program);
    registerStackCommands(program);

    const help = program.helpInformation();

    expect(help).toContain("dev");
    expect(help).toContain("restart");
    expect(help).toContain("logs");
    expect(help).toContain("doctor");
    expect(help).not.toContain("legacy");
    expect(help).not.toContain("up [options]");
    expect(help).not.toContain("status [options]");
  });
});

async function runModernCommand(args: string[]) {
  const lines: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...messages: unknown[]) => {
    lines.push(messages.map((message) => String(message ?? "")).join(" "));
  });
  const program = new Command();
  program.exitOverride();
  registerModernCommands(program);
  await program.parseAsync(["node", "kibaco", ...args]);
  return lines.join("\n");
}

async function fixtureDir() {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "kibaco-cli-"));
  process.env.KIBACO_HOME = await fs.mkdtemp(path.join(os.tmpdir(), "kibaco-home-"));
  const configPath = await writeInitialProxyConfig(
    undefined,
    {
      workspace: "smoke",
      proxyPort: 8080,
      projectName: "web",
      host: "web.localhost",
      target: "http://localhost:3000",
      command: "pnpm dev",
      cwd: "."
    },
    cwd
  );
  await fs.writeJson(configPath, {
    workspace: "smoke",
    proxyPort: 8080,
    services: [
      {
        name: "postgres",
        image: "postgres:16",
        ports: ["5432:5432"]
      }
    ],
    projects: [
      {
        name: "web",
        host: "web.localhost",
        target: "http://localhost:3000",
        command: "pnpm dev",
        cwd: ".",
        services: ["postgres"]
      }
    ]
  });
  return cwd;
}
