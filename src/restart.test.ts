import path from "node:path";
import os from "node:os";
import fs from "fs-extra";
import { afterEach, describe, expect, it } from "vitest";
import { consumeRestartRequests, requestProjectRestart } from "./restart.js";

describe("restart requests", () => {
  const originalKibanHome = process.env.KIBAN_HOME;

  afterEach(() => {
    if (originalKibanHome === undefined) delete process.env.KIBAN_HOME;
    else process.env.KIBAN_HOME = originalKibanHome;
  });

  it("stores and consumes restart requests by workspace", async () => {
    process.env.KIBAN_HOME = await fs.mkdtemp(path.join(os.tmpdir(), "kiban-restart-"));

    await requestProjectRestart("demo", "web");

    await expect(consumeRestartRequests("other")).resolves.toEqual([]);
    await expect(consumeRestartRequests("demo")).resolves.toEqual(["web"]);
    await expect(consumeRestartRequests("demo")).resolves.toEqual([]);
  });
});
