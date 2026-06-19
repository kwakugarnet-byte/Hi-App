import { pgTable, serial, varchar, timestamp } from "drizzle-orm/pg-core";

export const vipCustomersTable = pgTable("vip_customers", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type VipCustomer = typeof vipCustomersTable.$inferSelect;
export type InsertVipCustomer = typeof vipCustomersTable.$inferInsert;
