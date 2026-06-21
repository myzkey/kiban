import { readFileSync } from "node:fs";

type PackageJson = {
  version?: string;
};

export function packageVersion() {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as PackageJson;
  return pkg.version ?? "0.0.0";
}
