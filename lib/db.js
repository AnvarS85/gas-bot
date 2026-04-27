import { sql } from "@vercel/postgres";

export async function initDb() {
  await sql`
    CREATE TABLE IF NOT EXISTS owners (
      telegram_id TEXT PRIMARY KEY,
      approved INTEGER DEFAULT 0
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS stations (
      id SERIAL PRIMARY KEY,
      owner_telegram_id TEXT NOT NULL,
      station_name TEXT NOT NULL,
      fuel_type TEXT NOT NULL,
      price REAL NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      active INTEGER DEFAULT 1
    )
  `;
}