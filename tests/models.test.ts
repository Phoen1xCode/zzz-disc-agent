import { describe, test, expect } from "bun:test";
import { DriveDiscSchema, fingerprint, StatType, DiscStatus, SubStatSchema } from "../src/database/models.ts";

describe("models", () => {
  describe("StatType", () => {
    test("accepts valid stat types", () => {
      expect(StatType.parse("暴击率")).toBe("暴击率");
      expect(StatType.parse("攻击力%")).toBe("攻击力%");
    });
    test("rejects invalid stat types", () => {
      expect(() => StatType.parse("不存在")).toThrow();
    });
  });

  describe("DriveDiscSchema", () => {
    test("parses valid disc with defaults", () => {
      const disc = DriveDiscSchema.parse({
        slot: 4,
        setName: "极地重裘",
        rarity: 3,
        level: 0,
        mainStat: "暴击率",
        mainValue: 9.6,
        subStats: [
          { statType: "攻击力%", value: 3.0, position: 0 },
          { statType: "暴击伤害", value: 4.8, position: 1 },
        ],
      });
      expect(disc.slot).toBe(4);
      expect(disc.status).toBe("unreviewed");
      expect(disc.isEquipped).toBe(false);
      expect(disc.subStats).toHaveLength(2);
    });

    test("rejects invalid slot (7)", () => {
      expect(() =>
        DriveDiscSchema.parse({
          slot: 7, setName: "极地重裘", rarity: 3, level: 0, mainStat: "暴击率", mainValue: 9.6,
        })
      ).toThrow();
    });

    test("rejects invalid rarity (0)", () => {
      expect(() =>
        DriveDiscSchema.parse({
          slot: 1, setName: "极地重裘", rarity: 0, level: 0, mainStat: "生命值", mainValue: 100,
        })
      ).toThrow();
    });

    test("rejects level > 15", () => {
      expect(() =>
        DriveDiscSchema.parse({
          slot: 1, setName: "极地重裘", rarity: 3, level: 16, mainStat: "生命值", mainValue: 100,
        })
      ).toThrow();
    });
  });

  describe("fingerprint", () => {
    test("produces consistent 12-char hash", () => {
      const disc = DriveDiscSchema.parse({
        slot: 4, setName: "极地重裘", rarity: 3, mainStat: "暴击率", mainValue: 9.6,
        subStats: [
          { statType: "攻击力%", value: 3.0, position: 0 },
          { statType: "暴击伤害", value: 4.8, position: 1 },
        ],
      });
      const fp1 = fingerprint(disc);
      const fp2 = fingerprint(disc);
      expect(fp1).toBe(fp2);
      expect(fp1).toHaveLength(12);
    });

    test("different discs produce different hashes", () => {
      const disc1 = DriveDiscSchema.parse({
        slot: 4, setName: "极地重裘", rarity: 3, mainStat: "暴击率", mainValue: 9.6,
      });
      const disc2 = DriveDiscSchema.parse({
        slot: 5, setName: "极地重裘", rarity: 3, mainStat: "攻击力%", mainValue: 30.0,
      });
      expect(fingerprint(disc1)).not.toBe(fingerprint(disc2));
    });

    test("sub stat order does not affect hash", () => {
      const disc1 = DriveDiscSchema.parse({
        slot: 4, setName: "极地重裘", rarity: 3, mainStat: "暴击率", mainValue: 9.6,
        subStats: [
          { statType: "攻击力%", value: 3.0, position: 0 },
          { statType: "暴击伤害", value: 4.8, position: 1 },
        ],
      });
      const disc2 = DriveDiscSchema.parse({
        slot: 4, setName: "极地重裘", rarity: 3, mainStat: "暴击率", mainValue: 9.6,
        subStats: [
          { statType: "暴击伤害", value: 4.8, position: 1 },
          { statType: "攻击力%", value: 3.0, position: 0 },
        ],
      });
      expect(fingerprint(disc1)).toBe(fingerprint(disc2));
    });
  });
});
