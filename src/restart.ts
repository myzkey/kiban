import fs from "fs-extra";
import path from "node:path";
import { restartRequestDir, restartRequestPath } from "./paths.js";

export const ALL_PROJECTS_RESTART = "__all__";

export async function requestProjectRestart(workspace: string, projectName: string) {
  const filePath = restartRequestPath(workspace, projectName);
  await fs.ensureDir(restartRequestDir(workspace));
  await fs.writeJson(filePath, { projectName, requestedAt: new Date().toISOString() });
}

export async function consumeRestartRequests(workspace: string) {
  const directory = restartRequestDir(workspace);
  if (!(await fs.pathExists(directory))) return [];
  const files = await fs.readdir(directory);
  const names = (
    await Promise.all(
      files
        .filter((file) => file.endsWith(".json"))
        .map(async (file) => {
          const request = (await fs.readJson(path.join(directory, file)).catch(() => null)) as { projectName?: string } | null;
          return request?.projectName ?? file.slice(0, -".json".length);
        })
    )
  ).filter((name) => name.length > 0);
  await Promise.all(files.map((file) => fs.remove(path.join(directory, file))));
  return names;
}
