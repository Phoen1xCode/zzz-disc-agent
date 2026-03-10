import { Database } from "bun:sqlite";
import { resolve } from "path";
import { readFileSync } from "fs";
import type { DriveDisc } from "./models.ts";

export class DB {
  private db: Database;

  constructor(dbPath = "zzz_discs.db") {
    this.db = new Database(dbPath);
    this.db.exec("PRAGMA foreign_keys = ON");
    this.db.exec("PRAGMA journal_mode = WAL");
    this.initSchema();
  }

  private initSchema() {
    const schemaPath = resolve(import.meta.dir, "schema.sql");
    const sql = readFileSync(schemaPath, "utf-8");
    this.db.exec(sql);
  }

  insertDisc(disc: DriveDisc, fp: string): number {
    const result = this.db.query(
      `INSERT INTO drive_discs (slot, set_name, rarity, level, main_stat, main_value, status, is_equipped, equipped_to, fingerprint)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      disc.slot, disc.setName, disc.rarity, disc.level,
      disc.mainStat, disc.mainValue, disc.status,
      disc.isEquipped ? 1 : 0, disc.equippedTo, fp
    );
    const discId = result.lastInsertRowid as number;

    const insertSub = this.db.query(
      `INSERT INTO sub_stats (disc_id, stat_type, value, upgrade_count, position) VALUES (?, ?, ?, ?, ?)`
    );
    for (const sub of disc.subStats) {
      insertSub.run(discId, sub.statType, sub.value, sub.upgradeCount, sub.position);
    }
    return discId;
  }

  discExists(fp: string): boolean {
    const row = this.db.query("SELECT 1 FROM drive_discs WHERE fingerprint = ?").get(fp);
    return row !== null;
  }

  getDisc(discId: number): (DriveDisc & { id: number }) | null {
    const row = this.db.query("SELECT * FROM drive_discs WHERE id = ?").get(discId) as Record<string, unknown> | null;
    if (!row) return null;
    const subs = this.db.query("SELECT * FROM sub_stats WHERE disc_id = ? ORDER BY position").all(discId) as Record<string, unknown>[];
    return {
      id: row.id as number,
      slot: row.slot as number,
      setName: row.set_name as string,
      rarity: row.rarity as number,
      level: row.level as number,
      mainStat: row.main_stat as string,
      mainValue: row.main_value as number,
      subStats: subs.map((s) => ({
        statType: s.stat_type as string,
        value: s.value as number,
        upgradeCount: s.upgrade_count as number,
        position: s.position as number,
      })),
      status: row.status as string,
      isEquipped: row.is_equipped === 1,
      equippedTo: row.equipped_to as string | null,
    } as DriveDisc & { id: number };
  }

  getAllDiscs(): (DriveDisc & { id: number })[] {
    const rows = this.db.query("SELECT id FROM drive_discs").all() as { id: number }[];
    return rows.map((r) => this.getDisc(r.id)!);
  }

  getDiscsByStatus(status: string): (DriveDisc & { id: number })[] {
    const rows = this.db.query("SELECT id FROM drive_discs WHERE status = ?").all(status) as { id: number }[];
    return rows.map((r) => this.getDisc(r.id)!);
  }

  updateDiscStatus(discId: number, status: string) {
    this.db.query("UPDATE drive_discs SET status = ? WHERE id = ?").run(status, discId);
  }

  getStats(): { total: number; unreviewed: number; keep: number; discard: number; equipped: number } {
    const total = (this.db.query("SELECT COUNT(*) as c FROM drive_discs").get() as { c: number }).c;
    const counts = this.db.query("SELECT status, COUNT(*) as c FROM drive_discs GROUP BY status").all() as { status: string; c: number }[];
    const map: Record<string, number> = {};
    for (const r of counts) map[r.status] = r.c;
    return {
      total,
      unreviewed: map["unreviewed"] ?? 0,
      keep: map["keep"] ?? 0,
      discard: map["discard"] ?? 0,
      equipped: map["equipped"] ?? 0,
    };
  }

  updateScore(discId: number, character: string, score: number, team = "") {
    this.db.query(
      `INSERT INTO score_matrix (disc_id, character_name, team_name, score)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(disc_id, character_name, team_name) DO UPDATE SET score = excluded.score, scored_at = datetime('now')`
    ).run(discId, character, team, score);
  }

  getScoreMatrix(team?: string): { disc_id: number; character_name: string; team_name: string; score: number }[] {
    if (team) {
      return this.db.query("SELECT * FROM score_matrix WHERE team_name = ?").all(team) as { disc_id: number; character_name: string; team_name: string; score: number }[];
    }
    return this.db.query("SELECT * FROM score_matrix").all() as { disc_id: number; character_name: string; team_name: string; score: number }[];
  }

  logUpgrade(discId: number, fromLevel: number, toLevel: number, newSub?: string, decision?: string) {
    this.db.query(
      `INSERT INTO upgrade_logs (disc_id, from_level, to_level, new_sub, decision) VALUES (?, ?, ?, ?, ?)`
    ).run(discId, fromLevel, toLevel, newSub ?? null, decision ?? null);
  }

  saveAssignment(plan: Record<string, unknown>, totalScore: number, team?: string) {
    if (team) {
      this.db.query("UPDATE assignment_snapshots SET is_active = 0 WHERE team_name = ? AND is_active = 1").run(team);
    } else {
      this.db.query("UPDATE assignment_snapshots SET is_active = 0 WHERE team_name IS NULL AND is_active = 1").run();
    }
    this.db.query(
      `INSERT INTO assignment_snapshots (team_name, plan, total_score, is_active) VALUES (?, ?, ?, 1)`
    ).run(team ?? null, JSON.stringify(plan), totalScore);
  }

  getActiveAssignment(team?: string): { plan: string; total_score: number } | null {
    if (team) {
      return this.db.query("SELECT plan, total_score FROM assignment_snapshots WHERE team_name = ? AND is_active = 1").get(team) as { plan: string; total_score: number } | null;
    }
    return this.db.query("SELECT plan, total_score FROM assignment_snapshots WHERE team_name IS NULL AND is_active = 1").get() as { plan: string; total_score: number } | null;
  }

  close() {
    this.db.close();
  }
}
