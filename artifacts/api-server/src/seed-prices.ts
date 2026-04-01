import { db, menuItemsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const prices: Record<string, number> = {
  "Stella Artois": 550, "Heineken": 520, "Guinness": 580, "Corona": 530,
  "Strongbow": 500, "Kopparberg Strawberry": 480, "Rekorderlig Mango": 490,
  "Vodka": 380, "Gin": 390, "Rum": 380, "Tequila": 390,
  "Jack Daniels": 450, "Jameson": 460, "Glenfiddich 12": 600, "Johnnie Walker": 480,
  "House Red": 650, "House White": 650, "Prosecco": 700,
  "Coke": 280, "Diet Coke": 280, "Lemonade": 250, "Orange Juice": 300, "Water": 200,
};

async function seed() {
  const items = await db.select().from(menuItemsTable);
  for (const item of items) {
    const price = prices[item.name] ?? 400;
    await db.update(menuItemsTable).set({ pricePence: price }).where(eq(menuItemsTable.id, item.id));
    console.log(`${item.name} → ${price}p`);
  }
  console.log("Done.");
  process.exit(0);
}

seed().catch((e) => { console.error(e); process.exit(1); });
