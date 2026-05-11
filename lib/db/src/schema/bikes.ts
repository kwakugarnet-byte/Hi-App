import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const bikeStatuses = ["available", "rented", "maintenance"] as const;
export type BikeStatus = (typeof bikeStatuses)[number];

export const bikesTable = pgTable("bikes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull().default("available"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Bike = typeof bikesTable.$inferSelect;
export type InsertBike = typeof bikesTable.$inferInsert;
