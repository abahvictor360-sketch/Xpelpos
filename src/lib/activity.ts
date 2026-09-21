"use client";

import { getDb, getSetting } from "./db";
import { newId } from "./utils";
import type { Activity, ActivityKind } from "./types";

/** Activities older than this are dropped, so the log cannot grow without bound. */
const KEEP_DAYS = 120;

interface LogInput {
  kind: ActivityKind;
  message: string;
  detail?: string;
  amount?: number | null;
  referenceId?: string | null;
  staffName?: string;
}

/**
 * Records one line in the till's running history. Logging must never break the
 * thing it is recording, so failures here are swallowed.
 */
export async function logActivity(input: LogInput): Promise<void> {
  try {
    const staffName =
      input.staffName?.trim() || (await getSetting("cashier_name", "Counter")) || "Counter";

    const entry: Activity = {
      id: newId(),
      kind: input.kind,
      message: input.message,
      detail: input.detail ?? "",
      amount: input.amount ?? null,
      referenceId: input.referenceId ?? null,
      staffName,
      deviceId: await getSetting("device_id", ""),
      createdAt: new Date().toISOString(),
      syncState: "pending",
    };

    await getDb().activities.add(entry);
  } catch {
    // A missing log line is not worth failing a sale over.
  }
}

/** Newest first, optionally narrowed to one kind of event or a date range. */
export async function listActivities(options: {
  kind?: ActivityKind | "all";
  from?: Date;
  to?: Date;
  limit?: number;
} = {}): Promise<Activity[]> {
  const { kind = "all", from, to, limit = 300 } = options;

  let rows = await getDb().activities.orderBy("createdAt").reverse().toArray();

  if (kind !== "all") rows = rows.filter((row) => row.kind === kind);
  if (from) {
    const fromIso = from.toISOString();
    rows = rows.filter((row) => row.createdAt >= fromIso);
  }
  if (to) {
    const toIso = to.toISOString();
    rows = rows.filter((row) => row.createdAt <= toIso);
  }

  return rows.slice(0, limit);
}

/** Drops entries past the retention window. Safe to call on every launch. */
export async function pruneActivities(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000).toISOString();
    await getDb().activities.where("createdAt").below(cutoff).delete();
  } catch {
    // Pruning is housekeeping; never let it surface.
  }
}
