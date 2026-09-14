import type Database from 'better-sqlite3';
import type { NoShowAlertConfig, NoShowAlertConfigInput } from '@theall/shared';

const CONFIG_ID = 'default';
const DEFAULT_CONFIG: NoShowAlertConfig = { enabled: false, delayMinutes: 10 };

interface ConfigRow {
  enabled: number;
  delay_minutes: number;
}

export class NoShowAlertConfigRepository {
  constructor(private db: Database.Database) {}

  get(): NoShowAlertConfig {
    const row = this.db
      .prepare('SELECT enabled, delay_minutes FROM no_show_alert_config WHERE id = ?')
      .get(CONFIG_ID) as ConfigRow | undefined;
    if (!row) return DEFAULT_CONFIG;
    return { enabled: Boolean(row.enabled), delayMinutes: row.delay_minutes };
  }

  update(input: NoShowAlertConfigInput): NoShowAlertConfig {
    this.db
      .prepare(
        `INSERT INTO no_show_alert_config (id, enabled, delay_minutes) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled, delay_minutes = excluded.delay_minutes`
      )
      .run(CONFIG_ID, input.enabled ? 1 : 0, input.delayMinutes);
    return this.get();
  }
}
