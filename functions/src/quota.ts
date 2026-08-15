import { HttpsError } from "firebase-functions/v2/https";
import { Timestamp } from "firebase-admin/firestore";
import { db } from "./admin";
import type { AiQuotaDoc } from "./types";

const WINDOW_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAILY_LIMIT = 5;

/**
 * Atomically checks and consumes one unit of a user's daily AI quota.
 *
 * This runs as a Firestore transaction (read the quota doc, decide, write)
 * rather than a plain read-then-write, because two concurrent AI calls from
 * the same user (e.g. a double-tap on "generate plan") could otherwise both
 * read `dailyCount < dailyLimit` before either write lands, letting both
 * requests through and busting the cap. The transaction serializes that
 * read-modify-write so only one of them can win the last slot.
 *
 * Throws `resource-exhausted` (HttpsError) when the limit has been reached.
 */
export async function checkAndConsumeAiQuota(uid: string): Promise<void> {
  const ref = db.doc(`users/${uid}/meta/aiQuota`);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Timestamp.now();

    let data: AiQuotaDoc = snap.exists
      ? (snap.data() as AiQuotaDoc)
      : { dailyCount: 0, windowStartedAt: now, dailyLimit: DEFAULT_DAILY_LIMIT };

    const elapsedMs = now.toMillis() - data.windowStartedAt.toMillis();
    if (elapsedMs > WINDOW_MS) {
      data = { ...data, dailyCount: 0, windowStartedAt: now };
    }

    if (data.dailyCount >= data.dailyLimit) {
      const remainingMs = WINDOW_MS - (now.toMillis() - data.windowStartedAt.toMillis());
      const minutesRemaining = Math.ceil(remainingMs / 60000);
      throw new HttpsError(
        "resource-exhausted",
        `Too many AI requests right now. Please try again in ${minutesRemaining} minutes.`
      );
    }

    const next: AiQuotaDoc = {
      dailyCount: data.dailyCount + 1,
      windowStartedAt: data.windowStartedAt,
      dailyLimit: data.dailyLimit,
    };
    tx.set(ref, next);
  });
}
