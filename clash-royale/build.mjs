import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const wasmPath = path.join(
  root,
  "target/wasm32-unknown-unknown/release/clash_royale_wasm.wasm"
);
const templatePath = path.join(root, "template.html");
const outHtml = path.join(root, "index.html");
const outWasm = path.join(root, "game.wasm");

// Also publish into the Worker's static-assets directory so the game is
// reachable at /clash-royale/ on the deployed worker.
const deployDir = path.join(root, "..", "scramjet-proxy", "clash-royale");

const wasm = fs.readFileSync(wasmPath);
fs.writeFileSync(outWasm, wasm);

const b64 = wasm.toString("base64");
const tpl = fs.readFileSync(templatePath, "utf8");
if (!tpl.includes("__WASM_BASE64__")) {
  throw new Error("template.html is missing the __WASM_BASE64__ placeholder");
}
const html = tpl.replace("__WASM_BASE64__", b64);
fs.writeFileSync(outHtml, html);

fs.mkdirSync(deployDir, { recursive: true });
fs.writeFileSync(path.join(deployDir, "index.html"), html);
fs.writeFileSync(path.join(deployDir, "game.wasm"), wasm);

console.log(
  `built index.html (${(fs.statSync(outHtml).size / 1024).toFixed(1)} KiB) ` +
    `from ${(wasm.length / 1024).toFixed(1)} KiB wasm; ` +
    `published to scramjet-proxy/clash-royale/`
);
