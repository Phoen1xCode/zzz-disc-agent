import type { SkillLoader } from "./skill-loader.ts";
import type { DriveDisc } from "../database/models.ts";

export class LocalScorer {
  private skills: SkillLoader;

  constructor(skills: SkillLoader) {
    this.skills = skills;
  }

  score(disc: DriveDisc, character: string, team?: string): number {
    const content = this.skills.loadSkill("characters", character);
    if (!content) return 0;

    const setScore = this.scoreSet(disc, content);
    const mainScore = this.scoreMainStat(disc, content);
    const weights = this.skills.extractWeights(character, team);
    const maxValues = this.skills.extractMaxValues();
    const subScore = this.scoreSubStats(disc, weights, maxValues);
    const levelScore = this.scoreLevel(disc.level);
    return Math.min(100, setScore + mainScore + subScore + levelScore);
  }

  private scoreSet(disc: DriveDisc, content: string): number {
    if (content.includes(`4件套：${disc.setName}`) || content.includes(`4件套: ${disc.setName}`)) return 25;
    if (content.includes(`2件套：${disc.setName}`) || content.includes(`2件套: ${disc.setName}`)) return 10;
    return 0;
  }

  private scoreMainStat(disc: DriveDisc, content: string): number {
    if (disc.slot <= 3) return 30;
    const slotLabel = `[${disc.slot}]号位`;
    for (const line of content.split("\n")) {
      if (line.includes(slotLabel)) {
        if (line.includes(`${disc.mainStat}（首选）`) || line.includes(`${disc.mainStat}(首选)`)) return 30;
        if (line.includes(disc.mainStat)) return 15;
      }
    }
    return 0;
  }

  private scoreSubStats(disc: DriveDisc, weights: Record<string, number>, maxValues: Record<string, number>): number {
    if (disc.subStats.length === 0) return 0;
    let totalWeighted = 0;
    for (const sub of disc.subStats) {
      const weight = weights[sub.statType] ?? 0;
      const maxVal = maxValues[sub.statType] ?? 1;
      totalWeighted += (sub.value / maxVal) * weight;
    }
    // Use sum of top 4 weights as the theoretical max, not just the present substats
    const sortedWeights = Object.values(weights).sort((a, b) => b - a);
    const maxPossible = sortedWeights.slice(0, 4).reduce((sum, w) => sum + w, 0);
    if (maxPossible === 0) return 0;
    return (totalWeighted / maxPossible) * 45;
  }

  private scoreLevel(level: number): number {
    if (level >= 15) return 5;
    if (level >= 12) return 3;
    if (level >= 9) return 1;
    return 0;
  }
}
