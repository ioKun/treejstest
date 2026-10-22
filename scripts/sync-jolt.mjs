import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(
  root,
  "node_modules",
  "jolt-physics",
  "dist",
  "jolt-physics.multithread.wasm-compat.js"
);
const targetDir = join(root, "public");
const target = join(targetDir, "jolt-physics.multithread.wasm-compat.js");
const coiSource = join(root, "node_modules", "coi-serviceworker", "coi-serviceworker.min.js");
const coiTarget = join(targetDir, "coi-serviceworker.min.js");

if (!existsSync(source)) {
  console.error("jolt-physics is not installed. Run npm install first.");
  process.exit(1);
}

if (!existsSync(targetDir)) {
  mkdirSync(targetDir, { recursive: true });
}

const sourceSize = statSync(source).size;
const targetSize = existsSync(target) ? statSync(target).size : -1;

if (sourceSize !== targetSize) {
  copyFileSync(source, target);
  console.log("Copied Jolt MT multithread build to public/jolt-physics.multithread.wasm-compat.js");
}

if (existsSync(coiSource)) {
  const coiSize = statSync(coiSource).size;
  const coiTargetSize = existsSync(coiTarget) ? statSync(coiTarget).size : -1;
  if (coiSize !== coiTargetSize) {
    copyFileSync(coiSource, coiTarget);
    console.log("Copied coi-serviceworker to public/coi-serviceworker.min.js");
  }
} else {
  console.error("coi-serviceworker is not installed. Run npm install first.");
  process.exit(1);
}
