import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const distDir = "dist";

if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true });
}

execSync("tsc --project tsconfig.build.json", { stdio: "inherit" });

const pkg = JSON.parse(fs.readFileSync("package.json", "utf-8"));
delete pkg.devDependencies;
delete pkg.scripts;
pkg.main = "index.js";
pkg.types = "index.d.ts";
pkg.exports = {
  ".": {
    types: "./index.d.ts",
    default: "./index.js",
  },
};

fs.writeFileSync(
  path.join(distDir, "package.json"),
  JSON.stringify(pkg, null, 2),
);

console.log(`Built to ${distDir}/`);
