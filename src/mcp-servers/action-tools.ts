import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { ActionExecutor } from "../action/executor.ts";

export function createActionToolsServer(autoExecute = false) {
  const executor = new ActionExecutor(autoExecute);

  return createSdkMcpServer({
    name: "action-tools",
    version: "1.0.0",
    tools: [
      tool(
        "click_position",
        "点击屏幕指定位置（相对坐标 0~1 或绝对像素）",
        {
          x: z.number(),
          y: z.number(),
          relative: z.boolean().default(true).describe("true=相对比例，false=绝对像素"),
        },
        async ({ x, y, relative }) => {
          await executor.click(x, y, relative);
          return { content: [{ type: "text" as const, text: `已点击 (${x}, ${y})` }] };
        }
      ),

      tool(
        "press_key",
        "按下键盘按键（如 ESC、Enter 等）",
        { key: z.string().describe("按键名称") },
        async ({ key }) => {
          await executor.pressKey(key);
          return { content: [{ type: "text" as const, text: `已按键 ${key}` }] };
        }
      ),

      tool(
        "upgrade_disc_once",
        "执行一次驱动盘强化操作（点击强化按钮）",
        {},
        async () => {
          await executor.upgradeDiscOnce();
          return { content: [{ type: "text" as const, text: "已执行一次强化" }] };
        }
      ),
    ],
  });
}
