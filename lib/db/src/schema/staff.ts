import { pgTable, serial, varchar, integer } from "drizzle-orm/pg-core";

export const staffRoles = ["admin", "waitress", "bartender"] as const;
export type StaffRole = (typeof staffRoles)[number];

export const staffTable = pgTable("staff", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  pinHash: varchar("pin_hash", { length: 255 }).notNull(),
  role: varchar("role", { length: 20 }).notNull().default("waitress"),
  bonusPercent: integer("bonus_percent").notNull().default(0),
});

export type Staff = typeof staffTable.$inferSelect;
export type InsertStaff = typeof staffTable.$inferInsert;
