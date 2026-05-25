import path from "node:path";
import { fileURLToPath } from "node:url";
import { runPackagedSmoke } from "./lib/packaged-smoke.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

if (process.platform !== "darwin") {
  console.log("macOS packaged smoke skipped: this script only runs on macOS.");
  process.exit(0);
}

await runPackagedSmoke({
  executable: path.join(root, "release", "mac", "Who Eats Token.app", "Contents", "MacOS", "Who Eats Token"),
  packageHint: "npm run package:dir",
  platformName: "macos",
  model: "packaged-mac"
});
