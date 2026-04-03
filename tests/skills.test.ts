import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createSkillRegistry } from "../src/skills/registry.js";
import { createSkillEnablement } from "../src/skills/enablement.js";

describe("SkillRegistry", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skills-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("starts empty", () => {
    const registry = createSkillRegistry(tmpDir);
    expect(registry.list()).toEqual([]);
  });

  it("discovers skills from SKILL.md directories", () => {
    const skillDir = path.join(tmpDir, "web-search");
    fs.mkdirSync(skillDir);
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      "# Web Search\n\nSearch the web for information.\n",
    );

    const registry = createSkillRegistry(tmpDir);
    const skills = registry.list();

    expect(skills).toHaveLength(1);
    expect(skills[0].id).toBe("web-search");
    expect(skills[0].name).toBe("Web Search");
    expect(skills[0].description).toBe("Search the web for information.");
  });

  it("ignores directories without SKILL.md", () => {
    fs.mkdirSync(path.join(tmpDir, "no-skill"));
    fs.writeFileSync(path.join(tmpDir, "no-skill", "README.md"), "Not a skill");

    const registry = createSkillRegistry(tmpDir);
    expect(registry.list()).toEqual([]);
  });

  it("gets skill by ID", () => {
    const skillDir = path.join(tmpDir, "calculator");
    fs.mkdirSync(skillDir);
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# Calculator\n\nDo math.");

    const registry = createSkillRegistry(tmpDir);
    const skill = registry.get("calculator");

    expect(skill).toBeDefined();
    expect(skill!.id).toBe("calculator");
    expect(registry.get("nonexistent")).toBeUndefined();
  });

  it("unregisters skills", () => {
    const skillDir = path.join(tmpDir, "temp-skill");
    fs.mkdirSync(skillDir);
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# Temp\n\nTemporary.");

    const registry = createSkillRegistry(tmpDir);
    expect(registry.list()).toHaveLength(1);

    const result = registry.unregister("temp-skill");
    expect(result).toBe(true);
    expect(registry.list()).toHaveLength(0);
    expect(registry.unregister("temp-skill")).toBe(false);
  });
});

describe("SkillEnablement", () => {
  let tmpDir: string;
  let skillsDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "enablement-test-"));
    skillsDir = path.join(tmpDir, "skills");
    fs.mkdirSync(skillsDir);

    for (const id of ["web-search", "calculator", "email"]) {
      const dir = path.join(skillsDir, id);
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, "SKILL.md"), `# ${id}\n\nDescription.`);
    }
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("starts with no skills enabled", () => {
    const registry = createSkillRegistry(skillsDir);
    const wsDir = path.join(tmpDir, "workspace");
    fs.mkdirSync(wsDir);
    const enablement = createSkillEnablement(wsDir, registry);

    expect(enablement.listEnabledIds()).toEqual([]);
    expect(enablement.listEnabled()).toEqual([]);
  });

  it("enables and disables skills", () => {
    const registry = createSkillRegistry(skillsDir);
    const wsDir = path.join(tmpDir, "workspace");
    fs.mkdirSync(wsDir);
    const enablement = createSkillEnablement(wsDir, registry);

    expect(enablement.enable("web-search")).toBe(true);
    expect(enablement.enable("calculator")).toBe(true);
    expect(enablement.listEnabledIds().sort()).toEqual(["calculator", "web-search"]);

    expect(enablement.disable("web-search")).toBe(true);
    expect(enablement.listEnabledIds()).toEqual(["calculator"]);
  });

  it("cannot enable nonexistent skill", () => {
    const registry = createSkillRegistry(skillsDir);
    const wsDir = path.join(tmpDir, "workspace");
    fs.mkdirSync(wsDir);
    const enablement = createSkillEnablement(wsDir, registry);

    expect(enablement.enable("nonexistent")).toBe(false);
    expect(enablement.listEnabledIds()).toEqual([]);
  });

  it("isEnabled checks correctly", () => {
    const registry = createSkillRegistry(skillsDir);
    const wsDir = path.join(tmpDir, "workspace");
    fs.mkdirSync(wsDir);
    const enablement = createSkillEnablement(wsDir, registry);

    enablement.enable("email");
    expect(enablement.isEnabled("email")).toBe(true);
    expect(enablement.isEnabled("web-search")).toBe(false);
  });

  it("persists state to disk", () => {
    const registry = createSkillRegistry(skillsDir);
    const wsDir = path.join(tmpDir, "workspace");
    fs.mkdirSync(wsDir);

    const e1 = createSkillEnablement(wsDir, registry);
    e1.enable("web-search");
    e1.enable("email");

    const e2 = createSkillEnablement(wsDir, registry);
    expect(e2.listEnabledIds().sort()).toEqual(["email", "web-search"]);
  });

  it("enable is idempotent", () => {
    const registry = createSkillRegistry(skillsDir);
    const wsDir = path.join(tmpDir, "workspace");
    fs.mkdirSync(wsDir);
    const enablement = createSkillEnablement(wsDir, registry);

    enablement.enable("calculator");
    enablement.enable("calculator");
    expect(enablement.listEnabledIds()).toEqual(["calculator"]);
  });

  it("disable returns false for non-enabled skill", () => {
    const registry = createSkillRegistry(skillsDir);
    const wsDir = path.join(tmpDir, "workspace");
    fs.mkdirSync(wsDir);
    const enablement = createSkillEnablement(wsDir, registry);

    expect(enablement.disable("web-search")).toBe(false);
  });
});
