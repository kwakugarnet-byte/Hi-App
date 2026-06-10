import { Router, type IRouter, type Request, type Response } from "express";
import { eq, isNull, desc } from "drizzle-orm";
import { db, staffTable, staffChargesTable } from "@workspace/db";
import { logActivity } from "../lib/logActivity";

const router: IRouter = Router();

function requireAdmin(req: Request, res: Response): boolean {
  const user = req.user as { role?: string } | undefined;
  if (!req.isAuthenticated() || user?.role !== "admin") {
    res.status(401).json({ error: "Admin access required" });
    return false;
  }
  return true;
}

// ─── GET /api/staff-charges — all uncleared charges (admin only) ─────────────
router.get("/staff-charges", async (req: Request, res: Response): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  const rows = await db
    .select()
    .from(staffChargesTable)
    .where(isNull(staffChargesTable.clearedAt))
    .orderBy(desc(staffChargesTable.createdAt));
  res.json(rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    clearedAt: r.clearedAt?.toISOString() ?? null,
  })));
});

// ─── GET /api/staff-charges/my — my own uncleared charges ────────────────────
router.get("/staff-charges/my", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) { res.json([]); return; }
  const user = req.user as { id?: string } | undefined;
  const staffId = parseInt(user?.id ?? "", 10);
  if (isNaN(staffId)) { res.json([]); return; }
  const rows = await db
    .select()
    .from(staffChargesTable)
    .where(eq(staffChargesTable.staffId, staffId))
    .orderBy(desc(staffChargesTable.createdAt));
  res.json(rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    clearedAt: r.clearedAt?.toISOString() ?? null,
  })));
});

// ─── POST /api/staff-charges — add a charge (admin only) ─────────────────────
router.post("/staff-charges", async (req: Request, res: Response): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  const { staffId, type, amountPence, description } = req.body as {
    staffId?: number;
    type?: string;
    amountPence?: number;
    description?: string;
  };
  if (!staffId || !type || !amountPence || amountPence <= 0) {
    res.status(400).json({ error: "staffId, type and amountPence are required" });
    return;
  }
  const [staff] = await db.select({ name: staffTable.name }).from(staffTable).where(eq(staffTable.id, staffId));
  if (!staff) { res.status(404).json({ error: "Staff member not found" }); return; }

  const [charge] = await db.insert(staffChargesTable).values({
    staffId,
    staffName: staff.name,
    type,
    amountPence,
    description: description ?? null,
  }).returning();

  const actor = req.user as { firstName?: string; lastName?: string; role?: string };
  const actorName = [actor.firstName, actor.lastName].filter(Boolean).join(" ") || "Admin";
  await logActivity(actorName, actor.role ?? "admin", "staff_charge_added", {
    staffName: staff.name, type, amountPence, description,
  });

  res.json({ ...charge, createdAt: charge.createdAt.toISOString(), clearedAt: null });
});

// ─── POST /api/staff-charges/:id/clear — clear a charge (admin only) ─────────
router.post("/staff-charges/:id/clear", async (req: Request, res: Response): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const actor = req.user as { firstName?: string; lastName?: string; role?: string };
  const actorName = [actor.firstName, actor.lastName].filter(Boolean).join(" ") || "Admin";

  const [charge] = await db
    .update(staffChargesTable)
    .set({ clearedAt: new Date(), clearedBy: actorName })
    .where(eq(staffChargesTable.id, id))
    .returning();

  if (!charge) { res.status(404).json({ error: "Charge not found" }); return; }

  await logActivity(actorName, actor.role ?? "admin", "staff_charge_cleared", {
    staffName: charge.staffName, type: charge.type, amountPence: charge.amountPence,
  });

  res.json({ ok: true });
});

// ─── DELETE /api/staff-charges/:id — delete a charge (admin only) ────────────
router.delete("/staff-charges/:id", async (req: Request, res: Response): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(staffChargesTable).where(eq(staffChargesTable.id, id));
  res.json({ ok: true });
});

export default router;
