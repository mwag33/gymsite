import { HttpsError } from "firebase-functions/v2/https";
import { Timestamp } from "firebase-admin/firestore";
import { db } from "./admin";
import type { AiQuotaDoc } from "./types";

const WINDOW_MS = 24 * 60 * 60 * 1000;
// The plan-redesign's quota model (see functions/src/regeneratePlan.ts and
// the architecture plan doc) only needs ~1 call/week under realistic usage,
// so 5/day was originally sized as a generous ceiling - but during active
// use/testing, onboarding alone spends 2 (schedule + first exercise fill),
// and a couple of retries burns through 5 fast. Raised for headroom; the
// billing circuit breaker (functions/src/billingCircuitBreaker.ts) remains
// the real cost safety net, not this per-user counter.
const DEFAULT_DAILY_LIMIT = 20;

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
      : { dailyCount: 0, windowStartedAt: now };

    const elapsedMs = now.toMillis() - data.windowStartedAt.toMillis();
    if (elapsedMs > WINDOW_MS) {
      data = { ...data, dailyCount: 0, windowStartedAt: now };
    }

    if (data.dailyCount >= DEFAULT_DAILY_LIMIT) {
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
    };
    tx.set(ref, next);
  });
}

/**
 * Refunds one unit of daily AI quota after a failed generation attempt.
 *
 * checkAndConsumeAiQuota() reserves a unit *before* calling Gemini, on
 * purpose - otherwise a user already at their cap could keep triggering real
 * (billed) API calls with no gate at all. But that means a failure that
 * never reached a real answer (a transient Gemini error, a bad model name,
 * a network blip) would otherwise permanently cost the user a unit of their
 * daily cap through no fault of their own. Call this from the caller's catch
 * block whenever a Gemini call (schedule generation, exercise fill, etc.)
 * throws, so only attempts that actually produced a result count against
 * the limit.
 */
export async function refundAiQuota(uid: string): Promise<void> {
  const ref = db.doc(`users/${uid}/meta/aiQuota`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const data = snap.data() as AiQuotaDoc;
    tx.set(ref, { ...data, dailyCount: Math.max(0, data.dailyCount - 1) });
  });
}
