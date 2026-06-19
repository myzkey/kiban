import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const assertProxyPortUsable = vi.fn();
const closeProxyHandle = vi.fn();
const startOrReuseProxy = vi.fn();
const startProjectServices = vi.fn();
const getPortUsage = vi.fn();
const spawnStreamingProject = vi.fn();
const stopProcess = vi.fn();
const stopProcesses = vi.fn();
const consumeRestartRequests = vi.fn();

vi.mock("./proxy-runtime.js", () => ({
  assertProxyPortUsable,
  closeProxyHandle,
  startOrReuseProxy
}));

vi.mock("./service-runtime.js", () => ({
  startProjectServices
}));

vi.mock("./ports.js", () => ({
  getPortUsage
}));

vi.mock("./process.js", () => ({
  spawnStreamingProject,
  stopProcess,
  stopProcesses
}));

vi.mock("./restart.js", () => ({
  ALL_PROJECTS_RESTART: "__all__",
  consumeRestartRequests
}));

describe("dev", () => {
  beforeEach(() => {
    assertProxyPortUsable.mockReset().mockResolvedValue(undefined);
    closeProxyHandle.mockReset().mockResolvedValue(undefined);
    startOrReuseProxy.mockReset().mockResolvedValue({ reused: false, server: {} });
    startProjectServices.mockReset().mockResolvedValue(undefined);
    getPortUsage.mockReset().mockResolvedValue(null);
    spawnStreamingProject.mockReset().mockImplementation(() => childProcess());
    stopProcess.mockReset();
    stopProcesses.mockReset();
    consumeRestartRequests.mockReset().mockResolvedValue([]);
  });

  it("starts services, projects, and proxy in order", async () => {
    const calls: string[] = [];
    startProjectServices.mockImplementation(async () => calls.push("services"));
    spawnStreamingProject.mockImplementation(() => {
      calls.push("project");
      return childProcess();
    });
    startOrReuseProxy.mockImplementation(async () => {
      calls.push("proxy");
      return { reused: false, server: {} };
    });
    const { runDev } = await import("./dev.js");

    await runDev(config());

    expect(calls).toEqual(["services", "project", "proxy"]);
    expect(assertProxyPortUsable).toHaveBeenCalledWith(8080);
    expect(closeProxyHandle).toHaveBeenCalledWith({ reused: false, server: {} });
  });

  it("fails before spawning projects when a target port is in use", async () => {
    getPortUsage.mockResolvedValue({ port: 3000, command: "node", pid: 42 });
    const { runDev } = await import("./dev.js");

    await expect(runDev(config())).rejects.toMatchObject({ code: 3 });
    expect(spawnStreamingProject).not.toHaveBeenCalled();
    expect(startOrReuseProxy).not.toHaveBeenCalled();
  });

  it("starts only selected projects", async () => {
    const { runDev } = await import("./dev.js");

    await runDev(
      {
        ...config(),
        projects: [
          config().projects[0],
          {
            name: "api",
            host: "api.localhost",
            target: "http://localhost:3001",
            command: "pnpm dev:api",
            cwd: ".",
            services: ["postgres"]
          }
        ]
      },
      { projects: ["api"] }
    );

    expect(startProjectServices).toHaveBeenCalledWith(expect.objectContaining({ projects: [expect.objectContaining({ name: "api" })] }), { print: true });
    expect(spawnStreamingProject).toHaveBeenCalledTimes(1);
    expect(spawnStreamingProject).toHaveBeenCalledWith(expect.objectContaining({ name: "api" }), expect.anything());
    expect(startOrReuseProxy).toHaveBeenCalledWith(expect.objectContaining({ projects: [expect.objectContaining({ name: "api" })] }));
  });

  it("rejects unknown selected projects", async () => {
    const { runDev } = await import("./dev.js");
    await expect(runDev(config(), { projects: ["missing"] })).rejects.toMatchObject({ code: 6 });
  });

  it("rejects empty project config", async () => {
    const { runDev } = await import("./dev.js");
    await expect(runDev({ ...config(), projects: [] })).rejects.toThrow("No projects configured");
  });
});

function childProcess() {
  const child = new EventEmitter() as EventEmitter & { pid: number; exitCode: number | null };
  child.pid = 1;
  child.exitCode = null;
  setTimeout(() => {
    child.exitCode = 0;
    child.emit("exit", 0);
  }, 0);
  return child;
}

function config() {
  return {
    workspace: "demo",
    proxyPort: 8080,
    log: {
      maxBytes: 1024,
      maxFiles: 2
    },
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
}
