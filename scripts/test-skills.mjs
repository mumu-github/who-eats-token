import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillsDir = path.join(root, "skills");
const expectedSkills = [
  "who-eats-token-setup",
  "who-eats-token-doctor",
  "who-eats-token-adapter-author"
];

assert.ok(fs.existsSync(skillsDir), "skills/ directory is required.");

for (const skillName of expectedSkills) {
  const skillDir = path.join(skillsDir, skillName);
  const skillPath = path.join(skillDir, "SKILL.md");
  const agentPath = path.join(skillDir, "agents", "openai.yaml");
  assert.ok(fs.existsSync(skillPath), `${skillName} is missing SKILL.md.`);
  assert.ok(fs.existsSync(agentPath), `${skillName} is missing agents/openai.yaml.`);

  const skill = fs.readFileSync(skillPath, "utf8");
  const frontmatter = parseFrontmatter(skill);
  assert.equal(frontmatter.name, skillName, `${skillName} frontmatter name mismatch.`);
  assert.ok(frontmatter.description?.length > 80, `${skillName} needs a useful description.`);
  assert.ok(!skill.includes("[TODO"), `${skillName} still contains TODO placeholders.`);
  assert.ok(!skill.includes("## Structuring This Skill"), `${skillName} still contains template guidance.`);
  assert.ok(skill.includes("## References"), `${skillName} should use progressive disclosure references.`);
  assert.ok(fs.existsSync(path.join(skillDir, "references")), `${skillName} should include references/.`);

  const agent = fs.readFileSync(agentPath, "utf8");
  assert.ok(agent.includes("display_name:"), `${skillName} openai.yaml missing display_name.`);
  assert.ok(agent.includes("short_description:"), `${skillName} openai.yaml missing short_description.`);
  assert.ok(agent.includes("default_prompt:"), `${skillName} openai.yaml missing default_prompt.`);
}

const doctor = fs.readFileSync(path.join(skillsDir, "who-eats-token-doctor", "SKILL.md"), "utf8");
assert.ok(doctor.includes("Measure before guessing"), "Doctor skill must preserve measure-before-guessing workflow.");
assert.ok(doctor.includes("Preserve the user's current HUD behavior"), "Doctor skill must prevent unrelated HUD churn.");

const author = fs.readFileSync(path.join(skillsDir, "who-eats-token-adapter-author", "SKILL.md"), "utf8");
assert.ok(author.includes("Do not put always-on runtime monitoring inside a skill."), "Adapter author skill must keep runtime out of skills.");
assert.ok(author.includes("never send prompt/completion text"), "Adapter author skill must preserve privacy boundary.");

console.log("Skill checks passed.");

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.ok(match, "Missing YAML frontmatter.");
  const result = {};
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    result[key] = value.replace(/^["']|["']$/g, "");
  }
  return result;
}
