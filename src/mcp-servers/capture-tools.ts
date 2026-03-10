import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { ScreenCapture } from "../capture/screen-capture.ts";
import { OcrRecognizer } from "../capture/ocr-recognizer.ts";
import { UINavigator } from "../capture/ui-navigator.ts";

export function createCaptureToolsServer() {
  const capture = new ScreenCapture();
  const ocr = new OcrRecognizer();
  const navigator = new UINavigator();

  return createSdkMcpServer({
    name: "capture-tools",
    version: "1.0.0",
    tools: [
      tool(
        "capture_screen",
        "截取游戏全屏截图，返回截图信息",
        {},
        async () => {
          const buf = await capture.captureFullScreen();
          return {
            content: [{ type: "text" as const, text: `截图完成，大小：${buf.length} bytes` }],
          };
        }
      ),

      tool(
        "capture_and_ocr",
        "截图并进行 OCR 识别，返回识别结果（文本+置信度）",
        {
          region: z.object({
            left: z.number(),
            top: z.number(),
            width: z.number(),
            height: z.number(),
          }).optional().describe("裁剪区域，不传则全屏"),
        },
        async ({ region }) => {
          const buf = region
            ? await capture.captureRegion(region)
            : await capture.captureFullScreen();
          const result = await ocr.recognize(buf);
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                fullText: result.fullText,
                avgConfidence: result.avgConfidence,
                lineCount: result.lines.length,
                shouldFallbackToVision: ocr.shouldFallbackToVision(result),
              }, null, 2),
            }],
          };
        }
      ),

      tool(
        "capture_region_as_image",
        "截取指定区域并返回 base64 图片（用于 Vision API 回退）",
        {
          region: z.object({
            left: z.number(),
            top: z.number(),
            width: z.number(),
            height: z.number(),
          }),
        },
        async ({ region }) => {
          const buf = await capture.captureRegion(region);
          const resized = await capture.resize(buf);
          return {
            content: [{
              type: "image" as const,
              data: resized.toString("base64"),
              mimeType: "image/png",
            }],
          };
        }
      ),

      tool(
        "navigate_open_disc_inventory",
        "打开游戏驱动盘背包界面",
        {},
        async () => {
          await navigator.openDiscInventory();
          return { content: [{ type: "text" as const, text: "已打开驱动盘背包" }] };
        }
      ),

      tool(
        "navigate_next_page",
        "背包翻到下一页，返回是否成功（false=已到最后一页）",
        {},
        async () => {
          const hasNext = await navigator.goNextPage();
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ hasNextPage: hasNext }) }],
          };
        }
      ),

      tool(
        "navigate_select_disc",
        "选中背包中第 N 个格子的驱动盘",
        { grid_position: z.number().int().describe("格子编号（从0开始）") },
        async ({ grid_position }) => {
          await navigator.selectDisc(grid_position);
          return {
            content: [{ type: "text" as const, text: `已选中第 ${grid_position} 个格子` }],
          };
        }
      ),
    ],
  });
}
