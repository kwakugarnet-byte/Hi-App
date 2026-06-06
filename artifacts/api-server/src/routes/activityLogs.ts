import { Router, type IRouter, type Request, type Response } from "express";
import { desc, gte, lte, and, eq } from "drizzle-orm";
import { db, activityLogsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/activity-logs", async (req: Request, res: Response): Promise<void> => {
  const user = req.user as { role?: string } | undefined;
  if (!req.isAuthenticated() || user?.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  const { date, actor, action } = req.query as Record<string, string | undefined>;

  const conditions = [];

  if (date) {
    const d = new Date(date);
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
    conditions.push(gte(activityLogsTable.timestamp, start));
    conditions.push(lte(activityLogsTable.timestamp, end));
  }

  if (actor) {
    conditions.push(eq(activityLogsTable.actorName, actor));
  }

  if (action) {
    conditions.push(eq(activityLogsTable.action, action));
  }

  const logs = await db
    .select()
    .from(activityLogsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(activityLogsTable.timestamp))
    .limit(500);

  res.json(
    logs.map((l: typeof logs[number]) => ({
      id: l.id,
      timestamp: l.timestamp.toISOString(),
      actorName: l.actorName,
      actorRole: l.actorRole,
      action: l.action,
      details: l.details ?? null,
    }))
  );
});

export default router;
