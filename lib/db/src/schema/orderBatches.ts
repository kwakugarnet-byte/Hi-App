import { pgTable, text, serial, timestamp, integer, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { menuItemsTable } from "./menuItems";

export const orderBatchesTable = pgTable("order_batches", {
  id: serial("id").primaryKey(),
  customerName: text("customer_name").notNull(),
  waitressName: text("waitress_name").notNull(),
  status: text("status").notNull().default("pending"),
  saleType: text("sale_type").default("table"),
  phone: text("phone"),
  orderType: text("order_type"),
  deliveryLocation: text("delivery_location"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  correctionItemIds: json("correction_item_ids").$type<number[]>(),
  rejectionReason: text("rejection_reason"),
});

export const orderItemsTable = pgTable("order_items", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").notNull().references(() => orderBatchesTable.id),
  menuItemId: integer("menu_item_id").notNull().references(() => menuItemsTable.id),
  quantity: integer("quantity").notNull().default(1),
});

export const insertOrderBatchSchema = createInsertSchema(orderBatchesTable).omit({ id: true, createdAt: true, completedAt: true });
export const insertOrderItemSchema = createInsertSchema(orderItemsTable).omit({ id: true });

export type InsertOrderBatch = z.infer<typeof insertOrderBatchSchema>;
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type OrderBatch = typeof orderBatchesTable.$inferSelect;
export type OrderItem = typeof orderItemsTable.$inferSelect;
