import bcrypt from "bcryptjs";
import { db, staffTable } from "@workspace/db";
import { eq } from "drizzle-orm";

async function seed() {
  const pinHash = await bcrypt.hash("0000", 10);
  await db
    .insert(staffTable)
    .values({ name: "Admin", pinHash, isAdmin: true })
    .onConflictDoUpdate({
      target: staffTable.name,
      set: { pinHash, isAdmin: true },
    });
  console.log("Seeded: Admin → PIN: 0000 (isAdmin: true)");

  await db.update(staffTable).set({ isAdmin: false }).where(eq(staffTable.name, "Alice"));
  await db.update(staffTable).set({ isAdmin: false }).where(eq(staffTable.name, "Bob"));
  await db.update(staffTable).set({ isAdmin: false }).where(eq(staffTable.name, "Carol"));
  await db.update(staffTable).set({ isAdmin: false }).where(eq(staffTable.name, "Dave"));
  console.log("Done.");
  process.exit(0);
}

seed().catch((e) => { console.error(e); process.exit(1); });
