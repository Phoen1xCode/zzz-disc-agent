import { describe, test, expect } from "bun:test";
import { LocalScorer } from "../src/knowledge/local-scorer.ts";
import { SkillLoader } from "../src/knowledge/skill-loader.ts";
import type { DriveDisc } from "../src/database/models.ts";

describe("LocalScorer", () => {
  const skills = new SkillLoader("knowledge");
  const scorer = new LocalScorer(skills);

  const perfectDisc: DriveDisc = {
    slot: 4,
    setName: "极地重裘",
    rarity: 3,
    level: 0,
    mainStat: "暴击率",
    mainValue: 9.6,
    subStats: [
      { statType: "暴击伤害", value: 9.6, upgradeCount: 0, position: 0 },
      { statType: "攻击力%", value: 6.0, upgradeCount: 0, position: 1 },
      { statType: "穿透率", value: 4.8, upgradeCount: 0, position: 2 },
      { statType: "攻击力", value: 19, upgradeCount: 0, position: 3 },
    ],
    status: "unreviewed",
    isEquipped: false,
    equippedTo: null,
  };

  const badDisc: DriveDisc = {
    slot: 4,
    setName: "自由蓝调",
    rarity: 3,
    level: 0,
    mainStat: "暴击伤害",
    mainValue: 19.2,
    subStats: [
      { statType: "防御力", value: 15, upgradeCount: 0, position: 0 },
      { statType: "生命值", value: 112, upgradeCount: 0, position: 1 },
    ],
    status: "unreviewed",
    isEquipped: false,
    equippedTo: null,
  };

  const twoSetDisc: DriveDisc = {
    slot: 4,
    setName: "荒原骑士",
    rarity: 3,
    level: 0,
    mainStat: "暴击率",
    mainValue: 9.6,
    subStats: [
      { statType: "暴击伤害", value: 9.6, upgradeCount: 0, position: 0 },
    ],
    status: "unreviewed",
    isEquipped: false,
    equippedTo: null,
  };

  test("perfect disc for 艾莲 scores high", () => {
    const score = scorer.score(perfectDisc, "艾莲");
    // 套装25 + 主词条30 + 副词条(high) + 等级0 = high score
    expect(score).toBeGreaterThan(60);
  });

  test("bad disc for 艾莲 scores low", () => {
    const score = scorer.score(badDisc, "艾莲");
    // 套装0 + 主词条0(暴击伤害不是首选) + 副词条0(防御/生命无权重) + 等级0
    expect(score).toBeLessThan(20);
  });

  test("good disc scores higher than bad disc", () => {
    expect(scorer.score(perfectDisc, "艾莲")).toBeGreaterThan(scorer.score(badDisc, "艾莲"));
  });

  test("2-set match gives partial set score", () => {
    const score = scorer.score(twoSetDisc, "艾莲");
    // 荒原骑士是2件套推荐 → 10分
    expect(score).toBeGreaterThan(40); // 10(set) + 30(main) + sub
  });

  test("score is between 0 and 100", () => {
    expect(scorer.score(perfectDisc, "艾莲")).toBeGreaterThanOrEqual(0);
    expect(scorer.score(perfectDisc, "艾莲")).toBeLessThanOrEqual(100);
    expect(scorer.score(badDisc, "艾莲")).toBeGreaterThanOrEqual(0);
  });

  test("level 15 adds bonus", () => {
    const lvl0 = scorer.score(perfectDisc, "艾莲");
    const lvl15 = scorer.score({ ...perfectDisc, level: 15 }, "艾莲");
    expect(lvl15).toBeGreaterThan(lvl0);
  });

  test("slots 1-3 get full main stat score", () => {
    const slot1Disc: DriveDisc = {
      slot: 1, setName: "极地重裘", rarity: 3, level: 0,
      mainStat: "生命值", mainValue: 2200,
      subStats: [], status: "unreviewed", isEquipped: false, equippedTo: null,
    };
    const score = scorer.score(slot1Disc, "艾莲");
    // 套装25 + 主词条30 (固定) + 副词条0 = 55
    expect(score).toBe(55);
  });

  test("unknown character returns 0", () => {
    const score = scorer.score(perfectDisc, "不存在角色");
    expect(score).toBe(0);
  });
});
