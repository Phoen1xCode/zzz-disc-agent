export interface AppConfig {
  autoExecute: boolean;
  dbPath: string;
  knowledgeDir: string;
  ocrConfidenceThreshold: number;
}

export function loadConfig(): AppConfig {
  return {
    autoExecute: process.env.AUTO_EXECUTE === "true",
    dbPath: process.env.DB_PATH ?? "zzz_discs.db",
    knowledgeDir: process.env.KNOWLEDGE_DIR ?? "knowledge",
    ocrConfidenceThreshold: Number(process.env.OCR_CONFIDENCE_THRESHOLD ?? "0.7"),
  };
}
