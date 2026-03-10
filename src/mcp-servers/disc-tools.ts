// src/mcp-servers/disc-tools.ts

import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { DB } from "../database/db.ts";
import { SkillLoader } from "../knowledge/skill-loader.ts";
import { LocalScorer } from "../knowledge/local-scorer.ts";
import { DriveDiscSchema, fingerprint } from "../database/models.ts";
import type { DriveDisc } from "../database/models.ts";

export function createDiscToolsServer(dbPath = "zzz_discs.db", knowledgeDir = "knowledge") {
  const db = new DB(dbPath);
  const skills = new SkillLoader(knowledgeDir);
  const scorer = new LocalScorer(skills);

  return createSdkMcpServer({
    name: "disc-tools",
    version: "1.0.0",
    tools: [
      // ---- 数据库查询 ----
      tool(
        "get_disc",
        "从数据库获取指定驱动盘的完整信息，包含主词条和所有副词条",
        { disc_id: z.number().int().describe("驱动盘 ID") },
        async ({ disc_id }) => {
          const disc = db.getDisc(disc_id);
          return {
            content: [{ type: "text" as const, text: JSON.stringify(disc, null, 2) }],
          };
        }
      ),

      tool(
        "get_discs_by_status",
        "按状态筛选驱动盘列表（unreviewed/keep/discard/equipped）",
        { status: z.enum(["unreviewed", "keep", "discard", "equipped"]) },
        async ({ status }) => {
          const discs = db.getDiscsByStatus(status);
          return {
            content: [{ type: "text" as const, text: JSON.stringify(discs, null, 2) }],
          };
        }
      ),

      tool(
        "get_all_discs",
        "获取数据库中所有驱动盘",
        {},
        async () => {
          const discs = db.getAllDiscs();
          return {
            content: [{ type: "text" as const, text: JSON.stringify(discs, null, 2) }],
          };
        }
      ),

      tool(
        "get_db_stats",
        "获取数据库统计信息（总数、各状态数量）",
        {},
        async () => {
          const stats = db.getStats();
          return {
            content: [{ type: "text" as const, text: JSON.stringify(stats) }],
          };
        }
      ),

      // ---- 数据库写入 ----
      tool(
        "insert_disc",
        "导入一块新驱动盘到数据库（自动计算 fingerprint 去重）",
        {
          disc: z.string().describe("DriveDisc JSON 字符串"),
        },
        async ({ disc: discStr }) => {
          const disc: DriveDisc = DriveDiscSchema.parse(JSON.parse(discStr));
          const fp = fingerprint(disc);
          if (db.discExists(fp)) {
            return {
              content: [{ type: "text" as const, text: `跳过：fingerprint ${fp} 已存在` }],
            };
          }
          const id = db.insertDisc(disc, fp);
          return {
            content: [{ type: "text" as const, text: `已导入，ID: ${id}, fingerprint: ${fp}` }],
          };
        }
      ),

      tool(
        "update_disc_status",
        "更新驱动盘状态（unreviewed/keep/discard/equipped）",
        {
          disc_id: z.number().int(),
          status: z.enum(["unreviewed", "keep", "discard", "equipped"]),
        },
        async ({ disc_id, status }) => {
          db.updateDiscStatus(disc_id, status);
          return {
            content: [{ type: "text" as const, text: `已更新 disc ${disc_id} 状态为 ${status}` }],
          };
        }
      ),

      // ---- 评分相关 ----
      tool(
        "local_score",
        "使用本地评分器快速评分（无 LLM 调用），返回分值",
        {
          disc_id: z.number().int(),
          character: z.string(),
          team: z.string().optional(),
        },
        async ({ disc_id, character, team }) => {
          const disc = db.getDisc(disc_id);
          if (!disc) return { content: [{ type: "text" as const, text: "盘不存在" }] };
          const score = scorer.score(disc, character, team);
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ disc_id, character, team, score }) }],
          };
        }
      ),

      tool(
        "update_score",
        "更新评分矩阵中的分数",
        {
          disc_id: z.number().int(),
          character: z.string(),
          score: z.number(),
          team: z.string().optional(),
        },
        async ({ disc_id, character, score, team }) => {
          db.updateScore(disc_id, character, score, team);
          return {
            content: [{ type: "text" as const, text: `已更新评分：disc ${disc_id} → ${character}: ${score}` }],
          };
        }
      ),

      tool(
        "get_score_matrix",
        "获取完整评分矩阵（可选配队过滤）",
        { team: z.string().optional() },
        async ({ team }) => {
          const matrix = db.getScoreMatrix(team);
          return {
            content: [{ type: "text" as const, text: JSON.stringify(matrix, null, 2) }],
          };
        }
      ),

      // ---- 知识查询 ----
      tool(
        "get_character_build",
        "获取指定角色的驱动盘培养标准（套装偏好、主词条、副词条权重）",
        { character_name: z.string().describe("角色中文名称") },
        async ({ character_name }) => {
          const skill = skills.loadSkill("characters", character_name);
          return {
            content: [{ type: "text" as const, text: skill ?? `未找到角色 ${character_name} 的配置` }],
          };
        }
      ),

      tool(
        "get_all_characters",
        "获取系统中所有已配置的角色名称列表",
        {},
        async () => {
          const chars = skills.listCharacters();
          return {
            content: [{ type: "text" as const, text: JSON.stringify(chars) }],
          };
        }
      ),

      tool(
        "get_team_config",
        "获取指定配队的配置（角色微调、分配优先级等）",
        { team_name: z.string().describe("配队名称") },
        async ({ team_name }) => {
          const skill = skills.loadSkill("teams", team_name);
          return {
            content: [{ type: "text" as const, text: skill ?? `未找到配队 ${team_name} 的配置` }],
          };
        }
      ),

      tool(
        "recommend_team",
        "根据目标角色推荐配队方案",
        { target_character: z.string() },
        async ({ target_character }) => {
          const teams = skills.findTeamsForCharacter(target_character);
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ character: target_character, teams }) }],
          };
        }
      ),

      tool(
        "get_knowledge_context",
        "加载完整知识上下文（角色+配队+评分规则），用于注入 Agent prompt",
        {
          characters: z.array(z.string()),
          team: z.string().optional(),
        },
        async ({ characters, team }) => {
          const context = skills.loadContext(characters, team);
          return {
            content: [{ type: "text" as const, text: context }],
          };
        }
      ),

      // ---- 升级日志 ----
      tool(
        "log_upgrade",
        "记录一次升级日志",
        {
          disc_id: z.number().int(),
          from_level: z.number().int(),
          to_level: z.number().int(),
          new_sub: z.string().optional(),
          enhanced_sub: z.string().optional(),
          decision: z.enum(["continue", "keep", "discard"]),
        },
        async (args) => {
          db.logUpgrade(args.disc_id, args.from_level, args.to_level, args.new_sub, args.decision);
          return {
            content: [{ type: "text" as const, text: `已记录升级日志：disc ${args.disc_id} ${args.from_level}→${args.to_level} ${args.decision}` }],
          };
        }
      ),

      // ---- 分配方案 ----
      tool(
        "save_assignment",
        "保存分配方案快照",
        {
          plan: z.string().describe("分配方案 JSON"),
          total_score: z.number(),
          team: z.string().optional(),
        },
        async ({ plan, total_score, team }) => {
          db.saveAssignment(JSON.parse(plan), total_score, team);
          return {
            content: [{ type: "text" as const, text: "分配方案已保存" }],
          };
        }
      ),

      tool(
        "get_active_assignment",
        "获取当前生效的分配方案",
        { team: z.string().optional() },
        async ({ team }) => {
          const assignment = db.getActiveAssignment(team);
          return {
            content: [{ type: "text" as const, text: JSON.stringify(assignment, null, 2) }],
          };
        }
      ),
    ],
  });
}
