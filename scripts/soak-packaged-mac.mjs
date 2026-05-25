import path from "node:path";
import { fileURLToPath } from "node:url";
import { runPackagedSoak } from "./lib/packaged-soak.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

if (process.platform !== "darwin") {
  console.log("macOS packaged soak skipped: this script only runs on macOS.");
  process.exit(0);
}

await runPackagedSoak({
  executable: path.join(root, "release", "mac", "Who Eats Token.app", "Contents", "MacOS", "Who Eats Token"),
  packageHint: "npm run package:dir",
  platformName: "macos"
});
