import { createLogger } from "../utils/logger.ts";

const log = createLogger("OcrRecognizer");

export interface OcrLine {
  text: string;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number };
}

export interface OcrResult {
  fullText: string;
  lines: OcrLine[];
  avgConfidence: number;
}

export class OcrRecognizer {
  private initialized = false;

  async init(): Promise<void> {
    log.warn("OCR init: stub — requires @gutenye/ocr-node");
    this.initialized = true;
  }

  async recognize(_imageBuffer: Buffer): Promise<OcrResult> {
    if (!this.initialized) await this.init();
    log.warn("recognize: stub — returning empty result");
    return { fullText: "", lines: [], avgConfidence: 0 };
  }

  shouldFallbackToVision(result: OcrResult, threshold = 0.7): boolean {
    return result.avgConfidence < threshold;
  }
}
