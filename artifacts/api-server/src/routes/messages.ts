import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, gt } from "drizzle-orm";
import { db, messagesTable } from "@workspace/db";

const router: IRouter = Router();

function requireAuth(req: Request, res: Response, next: () => void) {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

function senderName(req: Request): string {
  const u = req.user as { firstName?: string; lastName?: string } | undefined;
  return u ? [u.firstName, u.lastName].filter(Boolean).join(" ") || "Staff" : "Staff";
}

// GET /messages?conversation=<id>&since=<iso>
router.get("/messages", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const conversation = (req.query.conversation as string) || "group";
  const since = req.query.since ? new Date(req.query.since as string) : null;

  const rows = since
    ? await db
        .select()
        .from(messagesTable)
        .where(and(eq(messagesTable.conversation, conversation), gt(messagesTable.createdAt, since)))
        .orderBy(messagesTable.createdAt)
    : await db
        .select()
        .from(messagesTable)
        .where(eq(messagesTable.conversation, conversation))
        .orderBy(desc(messagesTable.createdAt))
        .limit(60)
        .then((r) => r.reverse());

  res.json(rows.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })));
});

// GET /messages/latest — last message per conversation (for inbox preview)
router.get("/messages/latest", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const myName = senderName(req);
  // Get last 200 messages and derive conversations this user is part of
  const rows = await db
    .select()
    .from(messagesTable)
    .orderBy(desc(messagesTable.createdAt))
    .limit(200);

  const latestPerConv = new Map<string, typeof rows[number]>();
  for (const row of rows) {
    // Only include conversations this user is part of:
    // group = always, DM = only if myName is one of the participants
    const parts = row.conversation.split("|");
    const isGroup = row.conversation === "group";
    const isDm = parts.length === 2 && parts.includes(myName);
    if (!isGroup && !isDm) continue;
    if (!latestPerConv.has(row.conversation)) {
      latestPerConv.set(row.conversation, row);
    }
  }

  res.json(
    [...latestPerConv.entries()].map(([conv, row]) => ({
      conversation: conv,
      lastMessage: { ...row, createdAt: row.createdAt.toISOString() },
    }))
  );
});

// POST /messages
router.post("/messages", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { message, conversation } = req.body;
  if (!message || typeof message !== "string" || !message.trim()) {
    res.status(400).json({ error: "Message is required" });
    return;
  }
  const conv = typeof conversation === "string" && conversation.trim() ? conversation.trim() : "group";
  const [row] = await db
    .insert(messagesTable)
    .values({ staffName: senderName(req), message: message.trim(), conversation: conv })
    .returning();
  res.status(201).json({ ...row, createdAt: row.createdAt.toISOString() });
});

export default router;
