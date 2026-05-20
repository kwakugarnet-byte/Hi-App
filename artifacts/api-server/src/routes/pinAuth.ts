import { Router, type IRouter, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, staffTable, staffPermissionsTable } from "@workspace/db";
import {
  GetStaffResponse,
  PinLoginBody,
  GetCurrentAuthUserResponse,
  ChangePinBody,
} from "@workspace/api-zod";
import {
  clearSession,
  createSession,
  getSessionId,
  SESSION_COOKIE,
  SESSION_TTL,
  type SessionData,
} from "../lib/auth";
import { logActivity } from "../lib/logActivity";

const router: IRouter = Router();

function setSessionCookie(res: Response, sid: string) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: true,
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

router.get("/staff", async (_req: Request, res: Response): Promise<void> => {
  const staff = await db
    .select({ id: staffTable.id, name: staffTable.name, bonusPercent: staffTable.bonusPercent, bonusLastPaidAt: staffTable.bonusLastPaidAt })
    .from(staffTable)
    .orderBy(staffTable.name);
  res.json(GetStaffResponse.parse(staff.map((s) => ({ ...s, bonusLastPaidAt: s.bonusLastPaidAt?.toISOString() ?? null }))));
});

router.post("/pin-login", async (req: Request, res: Response): Promise<void> => {
  const parsed = PinLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const { staffId, pin } = parsed.data;

  const [staff] = await db
    .select()
    .from(staffTable)
    .where(eq(staffTable.id, staffId));

  if (!staff) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(pin, staff.pinHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const nameParts = staff.name.trim().split(/\s+/);
  const firstName = nameParts[0] ?? staff.name;
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : null;

  const sessionData: SessionData = {
    user: {
      id: staff.id.toString(),
      email: null,
      firstName,
      lastName,
      profileImageUrl: null,
      role: staff.role as "admin" | "waitress" | "bartender",
    },
    access_token: "staff",
  };

  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);

  await logActivity(staff.name, staff.role, "login");

  res.json(
    GetCurrentAuthUserResponse.parse({ user: sessionData.user })
  );
});

router.post("/pin-logout", async (req: Request, res: Response): Promise<void> => {
  const user = req.user as { id?: string; firstName?: string; lastName?: string; role?: string } | undefined;
  if (user) {
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || "unknown";
    await logActivity(name, user.role ?? "unknown", "logout");
  }
  const sid = getSessionId(req);
  await clearSession(res, sid);
  res.json({ ok: true });
});

router.post("/change-pin", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const parsed = ChangePinBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const staffId = parseInt((req.user as { id: string }).id, 10);
  const pinHash = await bcrypt.hash(parsed.data.newPin, 10);

  await db
    .update(staffTable)
    .set({ pinHash })
    .where(eq(staffTable.id, staffId));

  const user = req.user as { firstName?: string; lastName?: string; role?: string };
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || "unknown";
  await logActivity(name, user.role ?? "unknown", "pin_changed");

  res.json({ ok: true });
});

router.get("/staff/me/permissions", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated() || !req.user) { res.json({ permissions: [] }); return; }
  const user = req.user as { role?: string; id?: string };
  if (user.role === "admin") { res.json({ permissions: [] }); return; }
  const staffId = parseInt(user.id ?? "", 10);
  if (isNaN(staffId)) { res.json({ permissions: [] }); return; }
  const rows = await db
    .select({ permission: staffPermissionsTable.permission })
    .from(staffPermissionsTable)
    .where(eq(staffPermissionsTable.staffId, staffId));
  res.json({ permissions: rows.map((r) => r.permission) });
});

export default router;
