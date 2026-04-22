import { Router, type IRouter } from "express";
import { and, desc, eq, gte, isNull, lte } from "drizzle-orm";
import { db, shiftsTable } from "@workspace/db";
import {
  GetMyShiftResponse,
  EndShiftResponse,
  GetShiftsResponse,
  GetShiftsQueryParams,
} from "@workspace/api-zod";
import { logActivity } from "../lib/logActivity";

const router: IRouter = Router();

function shiftToJson(shift: typeof shiftsTable.$inferSelect) {
  return {
    id: shift.id,
    staffId: shift.staffId,
    staffName: shift.staffName,
    startedAt: shift.startedAt.toISOString(),
    endedAt: shift.endedAt ? shift.endedAt.toISOString() : null,
  };
}

function todayBounds() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return { start, end };
}

router.get("/shifts/me", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const staffId = parseInt((req.user as { id: string }).id, 10);
  const { start, end } = todayBounds();

  const [shift] = await db
    .select()
    .from(shiftsTable)
    .where(
      and(
        eq(shiftsTable.staffId, staffId),
        gte(shiftsTable.startedAt, start),
        lte(shiftsTable.startedAt, end),
      )
    )
    .orderBy(desc(shiftsTable.startedAt))
    .limit(1);

  res.json(GetMyShiftResponse.parse({ shift: shift ? shiftToJson(shift) : null }));
});

router.post("/shifts/start", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const user = req.user as { id: string; firstName?: string; lastName?: string; role?: string };
  const staffId = parseInt(user.id, 10);
  const { start, end } = todayBounds();

  const [existing] = await db
    .select()
    .from(shiftsTable)
    .where(
      and(
        eq(shiftsTable.staffId, staffId),
        isNull(shiftsTable.endedAt),
        gte(shiftsTable.startedAt, start),
        lte(shiftsTable.startedAt, end),
      )
    )
    .limit(1);

  if (existing) {
    res.status(409).json({ error: "Shift already active" });
    return;
  }

  const staffName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Staff";

  const [created] = await db
    .insert(shiftsTable)
    .values({ staffId, staffName, startedAt: new Date() })
    .returning();

  await logActivity(staffName, user.role ?? "unknown", "shift_start");

  res.status(201).json(shiftToJson(created!));
});

router.post("/shifts/end", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const user = req.user as { id: string; firstName?: string; lastName?: string; role?: string };
  const staffId = parseInt(user.id, 10);
  const { start, end } = todayBounds();

  const [active] = await db
    .select()
    .from(shiftsTable)
    .where(
      and(
        eq(shiftsTable.staffId, staffId),
        isNull(shiftsTable.endedAt),
        gte(shiftsTable.startedAt, start),
        lte(shiftsTable.startedAt, end),
      )
    )
    .limit(1);

  if (!active) {
    res.status(404).json({ error: "No active shift found" });
    return;
  }

  const [updated] = await db
    .update(shiftsTable)
    .set({ endedAt: new Date() })
    .where(eq(shiftsTable.id, active.id))
    .returning();

  const staffName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Staff";
  await logActivity(staffName, user.role ?? "unknown", "shift_end");

  res.json(EndShiftResponse.parse(shiftToJson(updated!)));
});

router.get("/shifts", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const user = req.user as { id: string; role?: string };
  const staffId = parseInt(user.id, 10);

  const params = GetShiftsQueryParams.safeParse(req.query);
  const dateStr = params.success && params.data.date ? params.data.date : null;

  let dayStart: Date, dayEnd: Date;
  if (dateStr) {
    const d = new Date(dateStr);
    dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  } else {
    const b = todayBounds();
    dayStart = b.start;
    dayEnd = b.end;
  }

  const isAdmin = user.role === "admin";
  const isBartender = user.role === "bartender";

  const shifts = await db
    .select()
    .from(shiftsTable)
    .where(
      isAdmin || isBartender
        ? and(gte(shiftsTable.startedAt, dayStart), lte(shiftsTable.startedAt, dayEnd))
        : and(
            eq(shiftsTable.staffId, staffId),
            gte(shiftsTable.startedAt, dayStart),
            lte(shiftsTable.startedAt, dayEnd),
          )
    )
    .orderBy(desc(shiftsTable.startedAt));

  res.json(GetShiftsResponse.parse(shifts.map(shiftToJson)));
});

export default router;
