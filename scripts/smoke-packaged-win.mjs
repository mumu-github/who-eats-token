import path from "node:path";
import { fileURLToPath } from "node:url";
import { runPackagedSmoke } from "./lib/packaged-smoke.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

if (process.platform !== "win32") {
  console.log("Windows packaged smoke skipped: this script only runs on Windows.");
  process.exit(0);
}

await runPackagedSmoke({
  executable: path.join(root, "release", "win-unpacked", "Who Eats Token.exe"),
  packageHint: "npm run package:dir",
  platformName: "windows",
  model: "packaged-win"
});
