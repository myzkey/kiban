import { beforeEach, describe, expect, it, vi } from "vitest";

const execa = vi.fn();

vi.mock("execa", () => ({
  execa
}));

describe("docker runtime", () => {
  beforeEach(() => {
    execa.mockReset().mockResolvedValue({ stdout: "", stderr: "" });
  });

  it("starts compose-backed services with docker compose up", async () => {
    const { upService } = await import("./docker.js");
    await upService({ workspace: "demo" }, composeService());

    expect(execa).toHaveBeenCalledWith("docker", [
      "compose",
      "--project-directory",
      "/repo",
      "-f",
      "/repo/compose.yaml",
      "up",
      "-d",
      "mysql"
    ]);
  });

  it("shows compose-backed service logs through docker compose", async () => {
    const { serviceLogTail } = await import("./docker.js");
    await serviceLogTail({ workspace: "demo" }, composeService(), 20);

    expect(execa).toHaveBeenCalledWith("docker", [
      "compose",
      "--project-directory",
      "/repo",
      "-f",
      "/repo/compose.yaml",
      "logs",
      "--tail",
      "20",
      "mysql"
    ]);
  });
});

function composeService() {
  return {
    name: "mysql",
    image: "mysql:8.0",
    ports: ["3306:3306"],
    env: {},
    volumes: [],
    dependsOn: [],
    composeFile: "/repo/compose.yaml"
  };
}
