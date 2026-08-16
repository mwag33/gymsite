import { onMessagePublished } from "firebase-functions/v2/pubsub";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "./admin";

// Standard GCP budget-alert Pub/Sub topic name (created when a budget with
// Pub/Sub notifications is configured in Cloud Billing). Kept as a constant
// rather than a per-project setting since the convention is stable.
const BUDGET_ALERT_TOPIC = "budget-alerts";

interface BudgetNotification {
  costAmount: number;
  budgetAmount: number;
  budgetDisplayName?: string;
  alertThresholdExceeded?: number;
  currencyCode?: string;
}

/**
 * Soft kill-switch for AI spend, not a billing shutoff.
 *
 * This only flips `/system/featureFlags.aiGenerationEnabled` to false, which
 * every AI callable (`generateSchedule`, `generateExercisesForWeek`,
 * `regeneratePlan`) checks before calling Gemini. It deliberately does NOT
 * call the Cloud Billing API to
 * disable billing on the project (which would take the whole app offline,
 * hosting included) - it just pauses the one feature that can run up an
 * open-ended AI bill, while login, logging workouts, and browsing existing
 * data keep working.
 *
 * Re-enabling is a manual action for v1: either flip the flag back via the
 * console/Firestore, or call `reenableAiGeneration` below with an admin
 * account, once the underlying cost spike has been investigated.
 */
export const billingCircuitBreaker = onMessagePublished(BUDGET_ALERT_TOPIC, async (event) => {
  const payload = event.data.message.json as BudgetNotification | undefined;

  if (!payload || typeof payload.costAmount !== "number" || typeof payload.budgetAmount !== "number") {
    return;
  }

  // Budget notifications fire at every configured threshold (e.g. 50%, 90%,
  // 100%). Only trip the breaker once cost has reached/exceeded the full
  // budget amount - i.e. the top configured threshold was crossed.
  const isAtOrOverBudget = payload.costAmount >= payload.budgetAmount;
  if (!isAtOrOverBudget) {
    return;
  }

  await db.doc("system/featureFlags").set({ aiGenerationEnabled: false }, { merge: true });
});

/**
 * Manually re-enables AI generation after a billing pause. Restricted via a
 * hardcoded `admin` custom claim (set out-of-band via the Admin SDK /
 * console) - good enough for v1; replace with a real roles system if the
 * admin surface grows.
 */
export const reenableAiGeneration = onCall(async (request) => {
  if (!request.auth || request.auth.token.admin !== true) {
    throw new HttpsError("permission-denied", "Only admins can re-enable AI generation.");
  }

  await db.doc("system/featureFlags").set({ aiGenerationEnabled: true }, { merge: true });
  return { success: true };
});
