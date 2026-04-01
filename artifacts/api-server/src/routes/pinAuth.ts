import { Router, type IRouter, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, staffTable } from "@workspace/db";
import {
  GetStaffResponse,
  PinLoginBody,
  GetCurrentAuthUserResponse,
} from "@workspace/api-zod";
import {
  clearSession,
  createSession,
  getSessionId,
  SESSION_COOKIE,
  SESSION_TTL,
  type SessionData,
} from "../lib/auth";

const router: IRouter = Router();

function setSessionCookie(res: Response, sid: string) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

router.get("/staff", async (_req: Request, res: Response): Promise<void> => {
  const staff = await db
    .select({ id: staffTable.id, name: staffTable.name })
    .from(staffTable)
    .orderBy(staffTable.name);
  res.json(GetStaffResponse.parse(staff));
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
    },
    access_token: "staff",
  };

  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);

  res.json(
    GetCurrentAuthUserResponse.parse({ user: sessionData.user })
  );
});

router.post("/pin-logout", async (req: Request, res: Response): Promise<void> => {
  const sid = getSessionId(req);
  await clearSession(res, sid);
  res.json({ ok: true });
});

export default router;
