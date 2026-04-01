import bcrypt from "bcryptjs";
import { count } from "drizzle-orm";
import { db, staffTable, menuItemsTable } from "@workspace/db";

const DEFAULT_STAFF = [
  { name: "Kwaku Garnet", role: "admin" as const, pin: "0000" },
  { name: "Kofi", role: "bartender" as const, pin: "1111" },
  { name: "Mabel", role: "waitress" as const, pin: "2222" },
  { name: "Peter", role: "waitress" as const, pin: "3333" },
];

const DEFAULT_MENU: { name: string; category: string; pricePence: number }[] = [
  // Beer
  { name: "Castle Lager", category: "Beer", pricePence: 400 },
  { name: "Hansa Pilsener", category: "Beer", pricePence: 400 },
  { name: "Heineken", category: "Beer", pricePence: 520 },
  { name: "Windhoek Draught", category: "Beer", pricePence: 400 },
  // Cider
  { name: "Brutal Fruit", category: "Cider", pricePence: 400 },
  { name: "Savanna Dry", category: "Cider", pricePence: 400 },
  // Soft Drinks
  { name: "Coke", category: "Soft Drinks", pricePence: 280 },
  { name: "Fanta Orange", category: "Soft Drinks", pricePence: 400 },
  { name: "Sparkling Water", category: "Soft Drinks", pricePence: 400 },
  { name: "Sprite", category: "Soft Drinks", pricePence: 400 },
  { name: "Still Water", category: "Soft Drinks", pricePence: 400 },
  // Spirits
  { name: "Gin & Tonic", category: "Spirits", pricePence: 400 },
  { name: "Rum & Coke", category: "Spirits", pricePence: 400 },
  { name: "Vodka Lime", category: "Spirits", pricePence: 400 },
  // Whiskey
  { name: "Jack Daniels & Coke", category: "Whiskey", pricePence: 400 },
  { name: "Jameson & Ginger", category: "Whiskey", pricePence: 400 },
  // Wine
  { name: "Red Wine (Glass)", category: "Wine", pricePence: 400 },
  { name: "White Wine (Glass)", category: "Wine", pricePence: 400 },
];

export async function seedIfEmpty(): Promise<void> {
  const [staffCount] = await db
    .select({ count: count() })
    .from(staffTable);

  if (Number(staffCount?.count ?? 0) > 0) {
    return;
  }

  console.log("[seed] Empty database — seeding default data…");

  for (const s of DEFAULT_STAFF) {
    const pinHash = await bcrypt.hash(s.pin, 10);
    await db.insert(staffTable).values({ name: s.name, pinHash, role: s.role });
    console.log(`[seed]   Staff: ${s.name} (${s.role}) PIN=${s.pin}`);
  }

  for (const item of DEFAULT_MENU) {
    await db.insert(menuItemsTable).values(item);
  }
  console.log(`[seed]   Menu items: ${DEFAULT_MENU.length} added`);

  console.log("[seed] Done.");
}
