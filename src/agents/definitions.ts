import type { AgentDefinition } from "@anthropic-ai/claude-agent-sdk";
import { SCANNER_PROMPT, EVALUATOR_PROMPT, OPTIMIZER_PROMPT, UPGRADE_PROMPT } from "./prompts.ts";

export function createScannerAgent(): AgentDefinition {
  return {
    description: "扫描游戏背包中的驱动盘，通过OCR识别并导入数据库",
    prompt: SCANNER_PROMPT,
    tools: [
      "mcp__disc-tools__insert_disc",
      "mcp__disc-tools__get_db_stats",
      "mcp__capture-tools__capture_screen",
      "mcp__capture-tools__capture_and_ocr",
      "mcp__capture-tools__capture_region_as_image",
      "mcp__capture-tools__navigate_open_disc_inventory",
      "mcp__capture-tools__navigate_next_page",
      "mcp__capture-tools__navigate_select_disc",
    ],
  };
}

export function createEvaluatorAgent(): AgentDefinition {
  return {
    description: "对驱动盘进行两阶段评分：本地快筛+LLM精细评分",
    prompt: EVALUATOR_PROMPT,
    tools: [
      "mcp__disc-tools__get_disc",
      "mcp__disc-tools__get_all_discs",
      "mcp__disc-tools__get_discs_by_status",
      "mcp__disc-tools__local_score",
      "mcp__disc-tools__update_score",
      "mcp__disc-tools__update_disc_status",
      "mcp__disc-tools__get_character_build",
      "mcp__disc-tools__get_all_characters",
      "mcp__disc-tools__get_knowledge_context",
      "mcp__disc-tools__get_score_matrix",
    ],
  };
}

export function createOptimizerAgent(): AgentDefinition {
  return {
    description: "使用Plan-Execute-Reflect循环进行全局最优驱动盘分配",
    prompt: OPTIMIZER_PROMPT,
    tools: [
      "mcp__disc-tools__get_disc",
      "mcp__disc-tools__get_discs_by_status",
      "mcp__disc-tools__get_score_matrix",
      "mcp__disc-tools__get_team_config",
      "mcp__disc-tools__get_knowledge_context",
      "mcp__disc-tools__save_assignment",
      "mcp__disc-tools__get_active_assignment",
    ],
  };
}

export function createUpgradeAgent(): AgentDefinition {
  return {
    description: "分析或执行驱动盘升级，在每个+3级观察点做出决策",
    prompt: UPGRADE_PROMPT,
    tools: [
      "mcp__disc-tools__get_disc",
      "mcp__disc-tools__local_score",
      "mcp__disc-tools__update_disc_status",
      "mcp__disc-tools__log_upgrade",
      "mcp__disc-tools__get_character_build",
      "mcp__disc-tools__get_knowledge_context",
      "mcp__capture-tools__capture_and_ocr",
      "mcp__action-tools__upgrade_disc_once",
    ],
  };
}
