/**
 * Wipes the Neon database schema and recreates it empty.
 * Used when Prisma's `migrate deploy` hits P3005 ("schema not empty")
 * because a previous attempt left tables behind.
 *
 * Usage:
 *   DATABASE_URL="postgres://..." npx tsx scripts/reset-neon-schema.ts
 *
 * Or just run it — it'll read DATABASE_URL from .env automatically.
 */
import "dotenv/config";
import { Client } from "pg";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set. Run with: DATABASE_URL=... npx tsx scripts/reset-neon-schema.ts");
    process.exit(1);
  }

  console.log("Connecting to:", url.replace(/:[^@]+@/, ":***@"));
  const client = new Client({ connectionString: url });
  await client.connect();

  console.log("Dropping public schema...");
  await client.query("DROP SCHEMA IF EXISTS public CASCADE;");

  console.log("Recreating empty public schema...");
  await client.query("CREATE SCHEMA public;");
  await client.query("GRANT ALL ON SCHEMA public TO public;");

  await client.end();
  console.log("✓ Done. Now restart the Fly machine — Prisma migrations will run cleanly.");
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
