import { createLogger } from "../utils/logger.ts";

const log = createLogger("ScreenCapture");

export class ScreenCapture {
  async captureFullScreen(): Promise<Buffer> {
    log.warn("captureFullScreen: stub — requires autoanchorjs in game environment");
    return Buffer.from("STUB_SCREENSHOT");
  }

  async captureRegion(region: { left: number; top: number; width: number; height: number }): Promise<Buffer> {
    log.warn(`captureRegion: stub — region=${JSON.stringify(region)}`);
    return Buffer.from("STUB_REGION");
  }

  async captureAsBase64(region?: { left: number; top: number; width: number; height: number }): Promise<string> {
    const buf = region ? await this.captureRegion(region) : await this.captureFullScreen();
    return buf.toString("base64");
  }

  async resize(buf: Buffer, _maxWidth = 1280, _maxHeight = 720): Promise<Buffer> {
    return buf;
  }
}
