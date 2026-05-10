import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const messagesTable = pgTable("messages", {
  id: serial("id").primaryKey(),
  staffName: text("staff_name").notNull(),
  message: text("message").notNull(),
  conversation: text("conversation").notNull().default("group"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
