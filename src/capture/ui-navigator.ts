import { createLogger } from "../utils/logger.ts";

const log = createLogger("UINavigator");

export class UINavigator {
  async openDiscInventory(): Promise<void> {
    log.warn("openDiscInventory: stub");
  }

  async goNextPage(): Promise<boolean> {
    log.warn("goNextPage: stub — returning false (no more pages)");
    return false;
  }

  async selectDisc(gridPosition: number): Promise<void> {
    log.warn(`selectDisc: stub — position=${gridPosition}`);
  }
}
