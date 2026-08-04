import { access, readdir, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const sourceDirectories = ["content", "lib", "options", "popup", "scripts", "tests"];
const topLevelFiles = ["background.js"];

async function findJavaScriptFiles(relativeDirectory) {
  const entries = await readdir(path.join(root, relativeDirectory), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) files.push(...await findJavaScriptFiles(relativePath));
    else if (/\.(?:js|mjs)$/.test(entry.name)) files.push(relativePath);
  }
  return files;
}

function checkSyntax(relativePath) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--check", relativePath], { cwd: root, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${relativePath} の構文チェックに失敗しました`)));
  });
}

const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
if (manifest.manifest_version !== 3) throw new Error("manifest_version は 3 である必要があります");
if (manifest.version !== packageJson.version) throw new Error("manifest.json と package.json のバージョンが一致していません");

const manifestFiles = [
  manifest.background?.service_worker,
  manifest.action?.default_popup,
  manifest.options_ui?.page,
  ...Object.values(manifest.icons || {}),
  ...manifest.content_scripts.flatMap((entry) => entry.js || [])
].filter(Boolean);
for (const file of manifestFiles) await access(path.join(root, file));

async function checkDomBindings(htmlPath, scriptPath) {
  const html = await readFile(path.join(root, htmlPath), "utf8");
  const script = await readFile(path.join(root, scriptPath), "utf8");
  const ids = [...script.matchAll(/document\.querySelector\("#([a-zA-Z][\w-]*)"\)/g)]
    .map((match) => match[1]);
  for (const id of ids) {
    if (!new RegExp(`id=["']${id}["']`).test(html)) {
      throw new Error(`${scriptPath} が参照する #${id} は ${htmlPath} に存在しません`);
    }
  }
}

await checkDomBindings("popup/popup.html", "popup/popup.js");
await checkDomBindings("options/options.html", "options/options.js");

const files = [...topLevelFiles];
for (const directory of sourceDirectories) files.push(...await findJavaScriptFiles(directory));
for (const file of files.sort()) await checkSyntax(file);
console.log(`syntax, manifest, and UI bindings: ok (${files.length} files, v${manifest.version})`);
