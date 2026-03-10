import { describe, test, expect } from "bun:test";
import { SkillLoader } from "../src/knowledge/skill-loader.ts";

describe("SkillLoader", () => {
  const loader = new SkillLoader("knowledge");

  test("loadSkill returns content for existing skill", () => {
    const content = loader.loadSkill("characters", "艾莲");
    expect(content).not.toBeNull();
    expect(content).toContain("极地重裘");
  });

  test("loadSkill returns null for nonexistent skill", () => {
    const content = loader.loadSkill("characters", "不存在");
    expect(content).toBeNull();
  });

  test("listCharacters returns available characters", () => {
    const chars = loader.listCharacters();
    expect(chars).toContain("艾莲");
    expect(chars).toContain("朱鸢");
    expect(chars).toContain("苍角");
  });

  test("listTeams returns available teams", () => {
    const teams = loader.listTeams();
    expect(teams).toContain("艾莲冰队");
  });

  test("findTeamsForCharacter finds matching teams", () => {
    const teams = loader.findTeamsForCharacter("艾莲");
    expect(teams).toContain("艾莲冰队");
  });

  test("findTeamsForCharacter returns empty for unknown character", () => {
    const teams = loader.findTeamsForCharacter("不存在角色");
    expect(teams).toHaveLength(0);
  });

  test("extractWeights parses scoring weights from character SKILL.md", () => {
    const weights = loader.extractWeights("艾莲");
    expect(weights["暴击率"]).toBe(1.0);
    expect(weights["暴击伤害"]).toBe(1.0);
    expect(weights["攻击力%"]).toBe(0.8);
    expect(weights["穿透率"]).toBe(0.5);
  });

  test("extractWeights returns empty for unknown character", () => {
    const weights = loader.extractWeights("不存在");
    expect(Object.keys(weights)).toHaveLength(0);
  });

  test("extractMaxValues parses max values from scoring SKILL.md", () => {
    const maxVals = loader.extractMaxValues();
    expect(maxVals["暴击率"]).toBe(4.8);
    expect(maxVals["暴击伤害"]).toBe(9.6);
    expect(maxVals["攻击力%"]).toBe(6.0);
    expect(maxVals["异常精通"]).toBe(9);
  });

  test("extractScoringFormula parses formula params", () => {
    const formula = loader.extractScoringFormula();
    expect(formula["套装匹配_4件"]).toBe(25);
    expect(formula["主词条_最优"]).toBe(30);
    expect(formula["副词条满分"]).toBe(45);
  });

  test("loadContext combines multiple sources", () => {
    const ctx = loader.loadContext(["艾莲"]);
    expect(ctx).toContain("艾莲");
    expect(ctx).toContain("评分公式");
  });

  test("loadContext includes team when specified", () => {
    const ctx = loader.loadContext(["艾莲"], "艾莲冰队");
    expect(ctx).toContain("艾莲冰队");
  });
});
