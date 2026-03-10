import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { DB } from "../src/database/db.ts";
import type { DriveDisc } from "../src/database/models.ts";
import { unlinkSync } from "fs";

const TEST_DB = "test_zzz.db";

describe("DB", () => {
  let db: DB;

  beforeEach(() => {
    db = new DB(TEST_DB);
  });

  afterEach(() => {
    db.close();
    try { unlinkSync(TEST_DB); } catch {}
  });

  const sampleDisc: DriveDisc = {
    slot: 4,
    setName: "极地重裘",
    rarity: 3,
    level: 0,
    mainStat: "暴击率",
    mainValue: 9.6,
    subStats: [
      { statType: "攻击力%", value: 3.0, upgradeCount: 0, position: 0 },
      { statType: "暴击伤害", value: 4.8, upgradeCount: 0, position: 1 },
    ],
    status: "unreviewed",
    isEquipped: false,
    equippedTo: null,
  };

  test("insertDisc and getDisc roundtrip", () => {
    const id = db.insertDisc(sampleDisc, "fp_001");
    expect(id).toBeGreaterThan(0);
    const disc = db.getDisc(id);
    expect(disc).not.toBeNull();
    expect(disc!.slot).toBe(4);
    expect(disc!.setName).toBe("极地重裘");
    expect(disc!.mainStat).toBe("暴击率");
    expect(disc!.subStats).toHaveLength(2);
    expect(disc!.subStats[0]!.statType).toBe("攻击力%");
  });

  test("discExists by fingerprint", () => {
    db.insertDisc(sampleDisc, "fp_002");
    expect(db.discExists("fp_002")).toBe(true);
    expect(db.discExists("fp_nonexist")).toBe(false);
  });

  test("getDisc returns null for nonexistent id", () => {
    expect(db.getDisc(999)).toBeNull();
  });

  test("updateDiscStatus", () => {
    const id = db.insertDisc(sampleDisc, "fp_003");
    db.updateDiscStatus(id, "keep");
    expect(db.getDisc(id)!.status).toBe("keep");
  });

  test("getDiscsByStatus", () => {
    db.insertDisc(sampleDisc, "fp_004");
    db.insertDisc({ ...sampleDisc, slot: 5, mainStat: "攻击力%", mainValue: 30 }, "fp_005");
    expect(db.getDiscsByStatus("unreviewed")).toHaveLength(2);
    expect(db.getDiscsByStatus("keep")).toHaveLength(0);
  });

  test("getAllDiscs", () => {
    db.insertDisc(sampleDisc, "fp_006");
    db.insertDisc({ ...sampleDisc, slot: 5, mainStat: "攻击力%", mainValue: 30 }, "fp_007");
    expect(db.getAllDiscs()).toHaveLength(2);
  });

  test("getStats", () => {
    db.insertDisc(sampleDisc, "fp_008");
    const id2 = db.insertDisc({ ...sampleDisc, slot: 5, mainStat: "攻击力%", mainValue: 30 }, "fp_009");
    db.updateDiscStatus(id2, "keep");
    const stats = db.getStats();
    expect(stats.total).toBe(2);
    expect(stats.unreviewed).toBe(1);
    expect(stats.keep).toBe(1);
  });

  test("updateScore and getScoreMatrix", () => {
    const id = db.insertDisc(sampleDisc, "fp_010");
    db.updateScore(id, "艾莲", 85.5);
    db.updateScore(id, "朱鸢", 60.0);
    const matrix = db.getScoreMatrix();
    expect(matrix).toHaveLength(2);
    // upsert: update existing score
    db.updateScore(id, "艾莲", 90.0);
    const updated = db.getScoreMatrix();
    expect(updated).toHaveLength(2);
    const aileen = updated.find(r => r.character_name === "艾莲");
    expect(aileen!.score).toBe(90.0);
  });

  test("getScoreMatrix with team filter", () => {
    const id = db.insertDisc(sampleDisc, "fp_011");
    db.updateScore(id, "艾莲", 85.5);
    db.updateScore(id, "艾莲", 90.0, "艾莲冰队");
    expect(db.getScoreMatrix()).toHaveLength(2);
    expect(db.getScoreMatrix("艾莲冰队")).toHaveLength(1);
  });

  test("logUpgrade does not throw", () => {
    const id = db.insertDisc(sampleDisc, "fp_012");
    expect(() => db.logUpgrade(id, 0, 3, '{"statType":"异常精通","value":2.0}', "continue")).not.toThrow();
  });

  test("saveAssignment and getActiveAssignment", () => {
    const plan = { "艾莲": { "4": 1 } };
    db.saveAssignment(plan, 90.0, "艾莲冰队");
    const active = db.getActiveAssignment("艾莲冰队");
    expect(active).not.toBeNull();
    expect(active!.total_score).toBe(90.0);
    expect(JSON.parse(active!.plan)).toEqual(plan);
  });

  test("saveAssignment deactivates previous", () => {
    db.saveAssignment({ "艾莲": { "4": 1 } }, 80.0, "艾莲冰队");
    db.saveAssignment({ "艾莲": { "4": 2 } }, 90.0, "艾莲冰队");
    const active = db.getActiveAssignment("艾莲冰队");
    expect(active!.total_score).toBe(90.0);
  });
});
