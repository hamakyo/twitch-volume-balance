import { readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const testDirectory = path.join(root, "tests");
const tests = (await readdir(testDirectory))
  .filter((file) => file.endsWith(".test.js"))
  .sort();

for (const test of tests) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join("tests", test)], { cwd: root, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${test} が失敗しました`)));
  });
}
console.log(`tests: ok (${tests.length} files)`);
