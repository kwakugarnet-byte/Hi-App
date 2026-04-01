import bcrypt from "bcryptjs";
import { db, staffTable } from "@workspace/db";
import { eq } from "drizzle-orm";

async function main() {
  const pins: [string, string][] = [
    ["Alice", "1111"],
    ["Bob", "2222"],
    ["Carol", "3333"],
    ["Dave", "4444"],
  ];
  for (const [name, pin] of pins) {
    const hash = await bcrypt.hash(pin, 10);
    await db.update(staffTable).set({ pinHash: hash }).where(eq(staffTable.name, name));
    console.log(`Reset ${name} → ${pin}`);
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
