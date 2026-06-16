import path from "node:path";
import os from "node:os";
import fs from "fs-extra";
import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerModernCommands } from "./commands/modern.js";
import { registerStackCommands } from "./commands/stack.js";
import { writeInitialProxyConfig } from "./config.js";

describe("cli smoke", () => {
  const originalCwd = process.cwd();
  const originalKibanHome = process.env.KIBAN_HOME;

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalKibanHome === undefined) delete process.env.KIBAN_HOME;
    else process.env.KIBAN_HOME = originalKibanHome;
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
          container: "kiban-smoke-postgres",
          running: false
        })
      ]
    });
  });

  it("prints inferred init config without writing when using init --detect", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "kiban-detect-"));
    process.env.KIBAN_HOME = await fs.mkdtemp(path.join(os.tmpdir(), "kiban-home-"));
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
    expect(help).toContain("doctor");
    expect(help).not.toContain("legacy");
    expect(help).not.toContain("up [options]");
    expect(help).not.toContain("status [options]");
    expect(help).not.toContain("logs [options]");
  });
});

async function runModernCommand(args: string[]) {
  const lines: string[] = [];
  vi.spyOn(console, "log").mockImplementation((message?: unknown) => {
    lines.push(String(message ?? ""));
  });
  const program = new Command();
  program.exitOverride();
  registerModernCommands(program);
  await program.parseAsync(["node", "kiban", ...args]);
  return lines.join("\n");
}

async function fixtureDir() {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "kiban-cli-"));
  process.env.KIBAN_HOME = await fs.mkdtemp(path.join(os.tmpdir(), "kiban-home-"));
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
