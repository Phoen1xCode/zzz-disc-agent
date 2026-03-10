import { resolve, join } from "path";
import { readFileSync, readdirSync, existsSync } from "fs";

export class SkillLoader {
  private knowledgeDir: string;

  constructor(knowledgeDir = "knowledge") {
    this.knowledgeDir = resolve(knowledgeDir);
  }

  loadSkill(...pathParts: string[]): string | null {
    const filePath = join(this.knowledgeDir, ...pathParts, "SKILL.md");
    if (!existsSync(filePath)) return null;
    return readFileSync(filePath, "utf-8");
  }

  loadContext(characters: string[], team?: string): string {
    const parts: string[] = [];
    const scoring = this.loadSkill("scoring");
    if (scoring) parts.push("## 评分公式\n\n" + scoring);
    for (const char of characters) {
      const skill = this.loadSkill("characters", char);
      if (skill) parts.push(`## 角色：${char}\n\n${skill}`);
    }
    if (team) {
      const teamSkill = this.loadSkill("teams", team);
      if (teamSkill) parts.push(`## 配队：${team}\n\n${teamSkill}`);
    }
    return parts.join("\n\n---\n\n");
  }

  listCharacters(): string[] {
    const dir = join(this.knowledgeDir, "characters");
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  }

  listTeams(): string[] {
    const dir = join(this.knowledgeDir, "teams");
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  }

  findTeamsForCharacter(character: string): string[] {
    return this.listTeams().filter((team) => {
      const content = this.loadSkill("teams", team);
      return content?.includes(character) ?? false;
    });
  }

  extractWeights(character: string, team?: string): Record<string, number> {
    if (team) {
      const teamContent = this.loadSkill("teams", team);
      if (teamContent) {
        const overrideWeights = this.parseTableFromContent(
          teamContent,
          `<!-- team-overrides: ${character} -->`,
          `<!-- /team-overrides: ${character} -->`
        );
        if (Object.keys(overrideWeights).length > 0) return overrideWeights;
      }
    }
    const content = this.loadSkill("characters", character);
    if (!content) return {};
    return this.parseTableFromContent(content, "<!-- scoring-weights -->", "<!-- /scoring-weights -->");
  }

  extractMaxValues(): Record<string, number> {
    const content = this.loadSkill("scoring");
    if (!content) return {};
    return this.parseTableFromContent(content, "<!-- max-values -->", "<!-- /max-values -->");
  }

  extractScoringFormula(): Record<string, number> {
    const content = this.loadSkill("scoring");
    if (!content) return {};
    return this.parseTableFromContent(content, "<!-- scoring-formula -->", "<!-- /scoring-formula -->");
  }

  private parseTableFromContent(content: string, startTag: string, endTag: string): Record<string, number> {
    const startIdx = content.indexOf(startTag);
    const endIdx = content.indexOf(endTag);
    if (startIdx === -1 || endIdx === -1) return {};
    const block = content.slice(startIdx + startTag.length, endIdx);
    const result: Record<string, number> = {};
    for (const line of block.split("\n")) {
      const match = line.match(/\|\s*(.+?)\s*\|\s*([\d.]+)\s*\|/);
      const headerLabels = ["--", "副词条", "项目", "单次最大值", "权重", "分值"];
      if (match && !headerLabels.includes(match[1].trim())) {
        result[match[1].trim()] = parseFloat(match[2]);
      }
    }
    return result;
  }
}
