import bcrypt from "bcryptjs";
import { db, staffTable } from "@workspace/db";

const staff = [
  { name: "Alice", pin: "1111" },
  { name: "Bob", pin: "2222" },
  { name: "Carol", pin: "3333" },
  { name: "Dave", pin: "4444" },
];

async function seed() {
  for (const s of staff) {
    const pinHash = await bcrypt.hash(s.pin, 10);
    await db
      .insert(staffTable)
      .values({ name: s.name, pinHash })
      .onConflictDoUpdate({ target: staffTable.name, set: { pinHash } });
    console.log(`Seeded: ${s.name} → PIN: ${s.pin}`);
  }
  console.log("Done.");
  process.exit(0);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
