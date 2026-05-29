import { db, activityLogsTable } from "@workspace/db";

export type LogAction =
  | "login"
  | "logout"
  | "pin_changed"
  | "order_placed"
  | "order_held"
  | "order_direct"
  | "order_completed"
  | "order_paid"
  | "order_returned"
  | "order_edited"
  | "order_resubmitted"
  | "account_settled"
  | "shift_start"
  | "shift_end"
  | "menu_item_created"
  | "menu_item_updated"
  | "menu_item_deleted"
  | "staff_created"
  | "staff_updated"
  | "staff_deleted";

export type LogDetails = Record<string, unknown>;

export async function logActivity(
  actorName: string,
  actorRole: string,
  action: LogAction,
  details?: LogDetails
): Promise<void> {
  try {
    await db.insert(activityLogsTable).values({
      actorName,
      actorRole,
      action,
      details: details ?? null,
    });
  } catch {
    // Never let logging break the main request
  }
}
