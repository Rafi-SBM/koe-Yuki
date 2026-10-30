import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
const output = ".next/standalone";
if (!existsSync(output)) throw new Error("Standalone build output is missing");
mkdirSync(`${output}/.next`, { recursive: true });
cpSync(".next/static", `${output}/.next/static`, { recursive: true });
if (existsSync("public")) cpSync("public", `${output}/public`, { recursive: true });
// Local builds may trace dotenv files. Ship secrets only as runtime configuration.
for (const entry of readdirSync(output)) if (entry.startsWith(".env")) rmSync(`${output}/${entry}`, { force: true });
