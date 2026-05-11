import { pgTable, serial, varchar, integer, timestamp } from "drizzle-orm/pg-core";

export const staffRoles = ["admin", "waitress", "bartender", "bike_manager"] as const;
export type StaffRole = (typeof staffRoles)[number];

export const staffTable = pgTable("staff", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  pinHash: varchar("pin_hash", { length: 255 }).notNull(),
  role: varchar("role", { length: 20 }).notNull().default("waitress"),
  bonusPercent: integer("bonus_percent").notNull().default(0),
  bonusLastPaidAt: timestamp("bonus_last_paid_at", { withTimezone: true }),
});

export type Staff = typeof staffTable.$inferSelect;
export type InsertStaff = typeof staffTable.$inferInsert;
