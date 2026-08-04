import { mkdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import AdmZip from "adm-zip";

const root = path.resolve(import.meta.dirname, "..");
const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
const releaseDirectory = path.join(root, "release");
const outputPath = path.join(releaseDirectory, `twitch-volume-balance-v${manifest.version}.zip`);
const packageEntries = [
  "manifest.json",
  "background.js",
  "assets",
  "content",
  "lib",
  "options",
  "popup"
];

await mkdir(releaseDirectory, { recursive: true });
await rm(outputPath, { force: true });

const zip = new AdmZip();
for (const entry of packageEntries) {
  const absolutePath = path.join(root, entry);
  const entryStat = await stat(absolutePath);
  if (entryStat.isDirectory()) zip.addLocalFolder(absolutePath, entry.replaceAll("\\", "/"));
  else zip.addLocalFile(absolutePath);
}
zip.writeZip(outputPath);

const archive = new AdmZip(outputPath);
const archivedNames = archive.getEntries().map((entry) => entry.entryName);
for (const required of ["manifest.json", "background.js", "content/bridge.js", "popup/popup.html"]) {
  if (!archivedNames.includes(required)) throw new Error(`ZIP に ${required} が含まれていません`);
}
if (archivedNames.some((name) => name.startsWith("tests/") || name === "package.json")) {
  throw new Error("ZIP に開発専用ファイルが混入しています");
}

console.log(`package: ${path.relative(root, outputPath)} (${archivedNames.length} entries)`);
