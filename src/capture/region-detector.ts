export interface ScreenRegion {
  left: number;
  top: number;
  width: number;
  height: number;
}

export class RegionDetector {
  // 驱动盘详情面板区域（游戏内）
  static discDetailRegion(): ScreenRegion {
    return { left: 0.6, top: 0.1, width: 0.35, height: 0.8 };
  }

  // 背包网格区域
  static inventoryGridRegion(): ScreenRegion {
    return { left: 0.05, top: 0.15, width: 0.5, height: 0.75 };
  }

  // 单个网格格子位置（从0开始）
  static gridCellPosition(index: number, cols = 6): { x: number; y: number } {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const grid = this.inventoryGridRegion();
    const cellW = grid.width / cols;
    const cellH = grid.height / 5; // 假设5行
    return {
      x: grid.left + cellW * (col + 0.5),
      y: grid.top + cellH * (row + 0.5),
    };
  }
}
