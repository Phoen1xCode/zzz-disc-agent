import { query } from "@anthropic-ai/claude-agent-sdk";
import { createInterface } from "readline/promises";
import { loadConfig } from "./utils/config.ts";
import { createLogger } from "./utils/logger.ts";
import { ORCHESTRATOR_PROMPT } from "./agents/prompts.ts";
import {
  createScannerAgent,
  createEvaluatorAgent,
  createOptimizerAgent,
  createUpgradeAgent,
} from "./agents/definitions.ts";
import { createDiscToolsServer } from "./mcp-servers/disc-tools.ts";
import { createCaptureToolsServer } from "./mcp-servers/capture-tools.ts";
import { createActionToolsServer } from "./mcp-servers/action-tools.ts";

const log = createLogger("main");

async function runQuery(
  prompt: string,
  config: ReturnType<typeof loadConfig>,
) {
  const discTools = createDiscToolsServer(config.dbPath, config.knowledgeDir);
  const captureTools = createCaptureToolsServer();
  const actionTools = createActionToolsServer(config.autoExecute);

  for await (const message of query({
    prompt,
    options: {
      systemPrompt: ORCHESTRATOR_PROMPT,
      allowedTools: ["Agent"],
      mcpServers: {
        "disc-tools": discTools,
        "capture-tools": captureTools,
        "action-tools": actionTools,
      },
      agents: {
        scanner: createScannerAgent(),
        evaluator: createEvaluatorAgent(),
        optimizer: createOptimizerAgent(),
        upgrade: createUpgradeAgent(),
      },
    },
  })) {
    if (message.type === "result" && message.subtype === "success") {
      console.log("\n" + message.result);
    }
  }
}

async function main() {
  const config = loadConfig();
  log.info("ZZZ Drive Disc Agent 启动");
  log.info(`数据库: ${config.dbPath}, 知识库: ${config.knowledgeDir}`);

  // Single-shot mode: --cmd "..."
  const cmdIndex = process.argv.indexOf("--cmd");
  const cmdArg = cmdIndex !== -1 ? process.argv[cmdIndex + 1] : undefined;
  if (cmdArg) {
    log.info(`执行命令: ${cmdArg}`);
    await runQuery(cmdArg, config);
    return;
  }

  // REPL mode
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log("ZZZ 驱动盘培养助手（输入 quit 退出）");
  console.log("示例: 扫描我的驱动盘 | 帮艾莲评分 | 优化艾莲冰队\n");

  while (true) {
    const input = await rl.question("你> ");
    const trimmed = input.trim();
    if (!trimmed) continue;
    if (trimmed === "quit" || trimmed === "exit") break;

    try {
      await runQuery(trimmed, config);
    } catch (err) {
      log.error(`执行失败: ${err}`);
    }
  }

  rl.close();
  log.info("已退出");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
