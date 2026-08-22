#!/usr/bin/env node

const path = require("path");
const { spawn } = require("child_process");

const appDir = __dirname;

function run(script, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(appDir, script), ...args], {
      cwd: appDir, env: process.env, stdio: "inherit",
    });
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${script} 結束代碼 ${code}`)));
    child.on("error", reject);
  });
}

async function main() {
  await run("sync.js", ["--apply-crm"]);
  await run("sheet-import.js", ["--apply"]);
}

main().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
