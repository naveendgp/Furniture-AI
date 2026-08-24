import { createClient } from "@libsql/client";

/* Creates the schema and clears all rows — an empty, production-clean database.
   Run with: npm run db:reset */

const db = createClient({ url: process.env.DATABASE_URL ?? "file:./dev.db" });

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS Vendor (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, createdAt TEXT NOT NULL DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS Product (id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, description TEXT, priceInr INTEGER NOT NULL, styleTags TEXT NOT NULL DEFAULT '[]', widthCm REAL, depthCm REAL, heightCm REAL, status TEXT NOT NULL DEFAULT 'READY', thumbnailUrl TEXT NOT NULL, modelUrl TEXT, sourceVideoUrl TEXT, meshyTaskId TEXT, frontYaw REAL NOT NULL DEFAULT 0, mount TEXT NOT NULL DEFAULT 'floor', vendorId TEXT, createdAt TEXT NOT NULL DEFAULT (datetime('now')), updatedAt TEXT NOT NULL DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS RoomProject (id TEXT PRIMARY KEY, name TEXT NOT NULL, roomType TEXT NOT NULL, style TEXT NOT NULL, photoUrl TEXT NOT NULL, thumbnailUrl TEXT NOT NULL, progress INTEGER NOT NULL DEFAULT 0, createdAt TEXT NOT NULL DEFAULT (datetime('now')), updatedAt TEXT NOT NULL DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS PlacedItem (id TEXT PRIMARY KEY, projectId TEXT NOT NULL, productId TEXT NOT NULL, posX REAL NOT NULL DEFAULT 0, posY REAL NOT NULL DEFAULT 0, posZ REAL NOT NULL DEFAULT 0, rotationY REAL NOT NULL DEFAULT 0, tiltX REAL NOT NULL DEFAULT 0, tiltZ REAL NOT NULL DEFAULT 0, scale REAL NOT NULL DEFAULT 1, createdAt TEXT NOT NULL DEFAULT (datetime('now')))`,
];

async function main() {
  for (const stmt of SCHEMA) await db.execute(stmt);
  await db.batch(
    ["PlacedItem", "Product", "RoomProject", "Vendor"].map(
      (t) => `DELETE FROM ${t}`,
    ),
  );
  console.log("Database reset — all tables empty.");
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
