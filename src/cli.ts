#!/usr/bin/env node
import { Command } from "commander";
import { registerModernCommands } from "./commands/modern.js";
import { registerStackCommands } from "./commands/stack.js";
import { registerSystemCommands } from "./commands/system.js";
import { error as printError } from "./output.js";
import { packageVersion } from "./version.js";

const program = new Command();

program
  .name("kibaco")
  .description("Start local app commands, Docker services, and localhost URLs with one command.")
  .version(packageVersion());

registerModernCommands(program);
registerStackCommands(program);
registerSystemCommands(program);

program.parseAsync().catch((err: Error & { code?: number }) => {
  printError(err.message);
  process.exit(typeof err.code === "number" ? err.code : 1);
});
