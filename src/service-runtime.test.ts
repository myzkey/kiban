import { beforeEach, describe, expect, it, vi } from "vitest";

const isDockerRunning = vi.fn();
const upService = vi.fn();
const downService = vi.fn();
const execServiceCommand = vi.fn();
const isComposeService = vi.fn();
const serviceRunning = vi.fn();
const serviceHealthy = vi.fn();
const serviceLogTail = vi.fn();
const serviceLogs = vi.fn();
const containerName = vi.fn();
const serviceContainerName = vi.fn();
const serviceTarget = vi.fn();
const waitForHealth = vi.fn();

vi.mock("./docker.js", () => ({
  containerName,
  downService,
  execServiceCommand,
  isComposeService,
  isDockerRunning,
  serviceLogTail,
  serviceLogs,
  serviceHealthy,
  serviceRunning,
  serviceContainerName,
  serviceTarget,
  upService
}));

vi.mock("./health.js", () => ({
  waitForHealth
}));

describe("service-runtime", () => {
  beforeEach(() => {
    isDockerRunning.mockReset().mockResolvedValue(true);
    upService.mockReset().mockResolvedValue(undefined);
    downService.mockReset().mockResolvedValue(undefined);
    execServiceCommand.mockReset().mockResolvedValue(undefined);
    isComposeService.mockReset().mockReturnValue(false);
    serviceRunning.mockReset().mockResolvedValue(true);
    serviceHealthy.mockReset().mockResolvedValue(true);
    serviceLogTail.mockReset().mockResolvedValue("database failed to initialize");
    serviceLogs.mockReset().mockResolvedValue(undefined);
    containerName.mockReset().mockImplementation((config, service) => `kibaco-${config.workspace}-${service.name}`);
    serviceContainerName.mockReset().mockImplementation((config, service) => `kibaco-${config.workspace}-${service.name}`);
    serviceTarget.mockReset().mockImplementation((config, service) => `kibaco-${config.workspace}-${service.name}`);
    waitForHealth.mockReset().mockResolvedValue(true);
  });

  it("starts dependencies before dependent services", async () => {
    const { startServices } = await import("./service-runtime.js");
    await startServices(config(), ["api"], { print: true });

    expect(upService.mock.calls.map(([, service]) => service.name)).toEqual(["postgres", "api"]);
  });

  it("starts unique project services once", async () => {
    const { startProjectServices } = await import("./service-runtime.js");
    await startProjectServices(
      {
        ...config(),
        projects: [{ services: ["postgres"] }, { services: ["postgres"] }]
      },
      { print: false }
    );

    expect(upService).toHaveBeenCalledTimes(1);
  });

  it("throws when Docker is not running", async () => {
    isDockerRunning.mockResolvedValue(false);
    const { startServices } = await import("./service-runtime.js");

    await expect(startServices(config(), ["postgres"])).rejects.toMatchObject({ code: 4 });
  });

  it("throws when a service health check fails", async () => {
    waitForHealth.mockResolvedValue(false);
    const { startServices } = await import("./service-runtime.js");

    await expect(startServices(config(), ["postgres"])).rejects.toMatchObject({
      code: 5,
      message: expect.stringContaining("kibaco services logs postgres")
    });
  });

  it("stops named services", async () => {
    const { stopServices } = await import("./service-runtime.js");
    await stopServices(config(), ["postgres"]);

    expect(downService).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ name: "postgres" }));
  });

  it("returns service statuses", async () => {
    const { getServiceStatuses } = await import("./service-runtime.js");
    const rows = await getServiceStatuses(config());

    expect(rows[0]).toEqual(
      expect.objectContaining({
        name: "postgres",
        container: "kibaco-demo-postgres",
        running: true
      })
    );
  });

  it("shows service logs", async () => {
    const { showServiceLogs } = await import("./service-runtime.js");
    await showServiceLogs(config(), "postgres", { follow: true });

    expect(serviceLogs).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ name: "postgres" }), { follow: true });
  });
});

function config() {
  return {
    workspace: "demo",
    services: [
      {
        name: "postgres",
        image: "postgres:16",
        ports: ["5432:5432"],
        env: {},
        volumes: [],
        dependsOn: []
      },
      {
        name: "api",
        image: "api:latest",
        ports: [],
        env: {},
        volumes: [],
        dependsOn: ["postgres"]
      }
    ]
  };
}
