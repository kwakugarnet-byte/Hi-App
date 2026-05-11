import { pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";

export const conversationReadsTable = pgTable(
  "conversation_reads",
  {
    id: serial("id").primaryKey(),
    staffName: text("staff_name").notNull(),
    conversation: text("conversation").notNull(),
    lastReadAt: timestamp("last_read_at").notNull().defaultNow(),
  },
  (t) => [unique("uq_conv_reads").on(t.staffName, t.conversation)]
);
