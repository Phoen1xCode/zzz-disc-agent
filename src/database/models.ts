import { z } from "zod";
import { createHash } from "crypto";

// ---- 枚举 ----
export const StatType = z.enum([
  "生命值", "生命值%", "攻击力", "攻击力%", "防御力", "防御力%",
  "暴击率", "暴击伤害", "穿透率", "异常精通", "异常掌控",
  "冲击力", "能量自动回复",
  "火属性伤害加成", "冰属性伤害加成", "电属性伤害加成",
  "物理伤害加成", "以太属性伤害加成",
]);
export type StatType = z.infer<typeof StatType>;

export const DiscStatus = z.enum(["unreviewed", "keep", "discard", "equipped"]);
export type DiscStatus = z.infer<typeof DiscStatus>;

// ---- 数据结构 ----
export const SubStatSchema = z.object({
  statType: StatType,
  value: z.number(),
  upgradeCount: z.number().int().default(0),
  position: z.number().int().min(0).max(3).default(0),
});
export type SubStat = z.infer<typeof SubStatSchema>;

export const DriveDiscSchema = z.object({
  id: z.number().int().optional(),
  slot: z.number().int().min(1).max(6),
  setName: z.string(),
  rarity: z.number().int().min(1).max(3),
  level: z.number().int().min(0).max(15).default(0),
  mainStat: StatType,
  mainValue: z.number(),
  subStats: z.array(SubStatSchema).default([]),
  status: DiscStatus.default("unreviewed"),
  isEquipped: z.boolean().default(false),
  equippedTo: z.string().nullable().default(null),
});
export type DriveDisc = z.infer<typeof DriveDiscSchema>;

export const DecisionSchema = z.object({
  action: z.enum(["继续升级", "保留当前等级", "废弃"]),
  targetCharacter: z.string().nullable().default(null),
  score: z.number(),
  reason: z.string(),
});
export type Decision = z.infer<typeof DecisionSchema>;

export const AssignmentPlanSchema = z.object({
  plan: z.record(z.string(), z.record(z.string(), z.number().int())),
  totalScore: z.number(),
  reasoning: z.string(),
});
export type AssignmentPlan = z.infer<typeof AssignmentPlanSchema>;

// ---- 工具函数 ----
export function fingerprint(disc: DriveDisc): string {
  const subs = disc.subStats
    .map((s) => `${s.statType}${s.value}`)
    .sort()
    .join("|");
  const data = `${disc.slot}|${disc.setName}|${disc.mainStat}|${subs}`;
  return createHash("md5").update(data).digest("hex").slice(0, 12);
}
