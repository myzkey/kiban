import { spawn, type ChildProcess } from "node:child_process";
import { execa } from "execa";
import fs from "fs-extra";
import path from "node:path";
import type { LogConfig, ProxyProjectConfig } from "./types.js";
import { warn } from "./output.js";
import { projectLogPath } from "./paths.js";

type ProjectLogStream = "stdout" | "stderr";

type SpawnProjectOptions = {
  workspace: string;
  log: LogConfig;
  stream?: boolean;
};

export function spawnStreamingProject(project: ProxyProjectConfig, options: SpawnProjectOptions) {
  ensureProjectLogFiles(options.workspace, project.name);
  const child = spawn(project.command, {
    cwd: project.cwd,
    shell: true,
    detached: true,
    env: process.env
  });

  child.stdout?.on("data", (chunk: Buffer) => {
    writeProjectLog(options.workspace, project.name, "stdout", chunk, options.log);
    if (options.stream ?? true) process.stdout.write(prefixLines(project.name, chunk));
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    writeProjectLog(options.workspace, project.name, "stderr", chunk, options.log);
    if (options.stream ?? true) process.stderr.write(prefixLines(project.name, chunk));
  });
  child.on("exit", (code, signal) => {
    warn(`${project.name} exited${code === null ? "" : ` with code ${code}`}${signal ? ` (${signal})` : ""}`);
  });

  return child;
}

export function ensureProjectLogFiles(workspace: string, projectName: string) {
  fs.ensureDirSync(path.dirname(projectLogPath(workspace, projectName)));
  fs.ensureFileSync(projectLogPath(workspace, projectName));
  fs.ensureFileSync(projectLogPath(workspace, projectName, "jsonl"));
}

export function writeProjectLog(workspace: string, projectName: string, stream: ProjectLogStream, chunk: Buffer | string, config: LogConfig) {
  const text = Buffer.isBuffer(chunk) ? chunk.toString() : chunk;
  const now = new Date().toISOString();
  const human = text
    .split(/\r?\n/)
    .map((line, index, lines) => (index === lines.length - 1 && line === "" ? "" : `${now} ${stream} ${line}`))
    .join("\n");
  const jsonl = text
    .split(/\r?\n/)
    .flatMap((line, index, lines) => (index === lines.length - 1 && line === "" ? [] : [{ time: now, project: projectName, stream, line }]))
    .map((entry) => JSON.stringify(entry))
    .join("\n");

  appendRotating(projectLogPath(workspace, projectName), human.endsWith("\n") ? human : `${human}\n`, config);
  if (jsonl.length > 0) appendRotating(projectLogPath(workspace, projectName, "jsonl"), `${jsonl}\n`, config);
}

export function projectLogFiles(workspace: string, projectName: string, format: "text" | "jsonl" = "text") {
  const extension = format === "jsonl" ? "jsonl" : "log";
  return [projectLogPath(workspace, projectName, extension)];
}

export function stopProcess(child: ChildProcess) {
  if (child.killed) return;
  if (!child.pid) {
    child.kill("SIGTERM");
    return;
  }
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
}

export function stopProcesses(children: ChildProcess[]) {
  for (const child of children) stopProcess(child);
}

export async function waitForProcesses(children: ChildProcess[]) {
  await new Promise<void>((resolve) => {
    if (children.length === 0) {
      resolve();
      return;
    }
    let exited = 0;
    for (const child of children) {
      child.on("exit", () => {
        exited += 1;
        if (exited === children.length) resolve();
      });
    }
  });
}

export async function fileSize(filePath: string) {
  try {
    return (await fs.stat(filePath)).size;
  } catch {
    return 0;
  }
}

export async function followLogs(logFiles: string[], offsets: Map<string, number>) {
  if (logFiles.length === 1) {
    const [logFile] = logFiles;
    const offset = (offsets.get(logFile) ?? 0) + 1;
    await execa("tail", ["-c", `+${offset}`, "-f", logFile], { stdio: "inherit" });
    return;
  }

  await execa("tail", ["-n", "0", "-f", ...logFiles], { stdio: "inherit" });
}

export async function printLogTail(logFiles: string[], lines: number) {
  for (const logFile of logFiles) {
    if (!(await fs.pathExists(logFile))) continue;
    const text = await fs.readFile(logFile, "utf8");
    const rows = text.trimEnd().split(/\r?\n/).slice(-lines);
    if (logFiles.length > 1) console.log(`==> ${logFile} <==`);
    if (rows.length > 0) console.log(rows.join("\n"));
  }
}

function appendRotating(filePath: string, content: string, config: LogConfig) {
  fs.ensureDirSync(path.dirname(filePath));
  rotateIfNeeded(filePath, Buffer.byteLength(content), config);
  fs.appendFileSync(filePath, content);
}

function rotateIfNeeded(filePath: string, incomingBytes: number, config: LogConfig) {
  const currentSize = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
  if (currentSize + incomingBytes <= config.maxBytes) return;

  for (let index = config.maxFiles - 1; index >= 1; index -= 1) {
    const source = `${filePath}.${index}`;
    const target = `${filePath}.${index + 1}`;
    if (fs.existsSync(target)) fs.removeSync(target);
    if (fs.existsSync(source)) fs.renameSync(source, target);
  }
  if (fs.existsSync(filePath)) fs.renameSync(filePath, `${filePath}.1`);
}

function prefixLines(projectName: string, chunk: Buffer) {
  return chunk
    .toString()
    .split(/\r?\n/)
    .map((line, index, lines) => (index === lines.length - 1 && line === "" ? "" : `[${projectName}] ${line}`))
    .join("\n");
}
