import { copyFile, cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const vendorDir = path.join(projectRoot, "client", "vendor");

await mkdir(vendorDir, { recursive: true });
await build({
  entryPoints: [path.join(projectRoot, "scripts", "markdown-vendor-entry.js")],
  outfile: path.join(vendorDir, "markdown-deps.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["chrome120"],
  minify: true,
  legalComments: "none",
});
await copyFile(
  path.join(
    projectRoot,
    "node_modules",
    "highlight.js",
    "styles",
    "github.css",
  ),
  path.join(vendorDir, "highlight-github.css"),
);
await copyFile(
  path.join(projectRoot, "node_modules", "katex", "dist", "katex.min.css"),
  path.join(vendorDir, "katex.min.css"),
);
await cp(
  path.join(projectRoot, "node_modules", "katex", "dist", "fonts"),
  path.join(vendorDir, "fonts"),
  { recursive: true },
);

for (const outputName of [
  "markdown-deps.js",
  "highlight-github.css",
  "katex.min.css",
]) {
  const outputPath = path.join(vendorDir, outputName);
  const contents = await readFile(outputPath, "utf8");
  await writeFile(outputPath, contents.replace(/[ \t]+$/gm, ""), "utf8");
}
