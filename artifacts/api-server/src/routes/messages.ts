import { Router, type IRouter, type Request, type Response } from "express";
import { desc, gt } from "drizzle-orm";
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

router.get("/messages", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const since = req.query.since ? new Date(req.query.since as string) : null;

  const rows = since
    ? await db
        .select()
        .from(messagesTable)
        .where(gt(messagesTable.createdAt, since))
        .orderBy(messagesTable.createdAt)
    : await db
        .select()
        .from(messagesTable)
        .orderBy(desc(messagesTable.createdAt))
        .limit(60)
        .then((r) => r.reverse());

  res.json(rows.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })));
});

router.post("/messages", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { message } = req.body;
  if (!message || typeof message !== "string" || !message.trim()) {
    res.status(400).json({ error: "Message is required" });
    return;
  }
  const [row] = await db
    .insert(messagesTable)
    .values({ staffName: senderName(req), message: message.trim() })
    .returning();
  res.status(201).json({ ...row, createdAt: row.createdAt.toISOString() });
});

export default router;
