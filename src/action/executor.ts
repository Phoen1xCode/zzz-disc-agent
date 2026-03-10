import { createLogger } from "../utils/logger.ts";

const log = createLogger("ActionExecutor");

export class ActionExecutor {
  private autoExecute: boolean;

  constructor(autoExecute = false) {
    this.autoExecute = autoExecute;
  }

  async click(x: number, y: number, relative = true): Promise<void> {
    if (!this.autoExecute) {
      log.info(`[建议模式] 请手动点击: (${x}, ${y}) relative=${relative}`);
      return;
    }
    log.warn(`click: stub — (${x}, ${y}) relative=${relative}`);
  }

  async pressKey(key: string): Promise<void> {
    if (!this.autoExecute) {
      log.info(`[建议模式] 请手动按键: ${key}`);
      return;
    }
    log.warn(`pressKey: stub — ${key}`);
  }

  async upgradeDiscOnce(): Promise<void> {
    if (!this.autoExecute) {
      log.info("[建议模式] 请手动执行一次强化");
      return;
    }
    log.warn("upgradeDiscOnce: stub");
  }
}
