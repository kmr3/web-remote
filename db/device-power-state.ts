import { env } from "cloudflare:workers";

export type DevicePower = "off" | "on";

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS device_power_states (
    device_id TEXT PRIMARY KEY NOT NULL,
    power TEXT NOT NULL CHECK (power IN ('off', 'on')),
    updated_at INTEGER NOT NULL
  )
`;

export async function readDevicePowerStates(): Promise<Record<string, DevicePower>> {
  const database = getDatabase();
  await ensureSchema(database);
  const result = await database
    .prepare("SELECT device_id, power FROM device_power_states")
    .all<{ device_id: string; power: DevicePower }>();

  return Object.fromEntries(result.results.map((row) => [row.device_id, row.power]));
}

export async function saveDevicePowerState(deviceId: string, power: DevicePower): Promise<void> {
  const database = getDatabase();
  await ensureSchema(database);
  await database
    .prepare(
      `INSERT INTO device_power_states (device_id, power, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(device_id) DO UPDATE SET
         power = excluded.power,
         updated_at = excluded.updated_at`,
    )
    .bind(deviceId, power, Date.now())
    .run();
}

function getDatabase(): D1Database {
  if (!env.DB) throw new Error("D1 binding DB is unavailable.");
  return env.DB;
}

async function ensureSchema(database: D1Database): Promise<void> {
  await database.prepare(CREATE_TABLE_SQL).run();
}
