import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const source = join(root, "static-demo");
const destination = join(root, "pages-dist");

await rm(destination, { force: true, recursive: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });
await cp(join(root, "public", "assets"), join(destination, "assets"), { recursive: true });
await writeFile(join(destination, ".nojekyll"), "");

console.log("Static Pages bundle written to pages-dist");
