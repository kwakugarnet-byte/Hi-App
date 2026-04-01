import { boolean, pgTable, serial, varchar } from "drizzle-orm/pg-core";

export const staffTable = pgTable("staff", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  pinHash: varchar("pin_hash", { length: 255 }).notNull(),
  isAdmin: boolean("is_admin").notNull().default(false),
});

export type Staff = typeof staffTable.$inferSelect;
export type InsertStaff = typeof staffTable.$inferInsert;
