# Fitness Plan

Mobile-first AI training app. React SPA + Firebase (Auth, Firestore, Cloud Functions, Hosting, Gemini).

## Stack

- `frontend/` — Vite + React + TypeScript SPA, deployed as static files to Firebase Hosting
- `functions/` — Cloud Functions (2nd gen, TypeScript) — Gemini proxy, quota enforcement, plan generation/recalculation, GDPR export/delete
- `firestore.rules`, `firestore.indexes.json` — Firestore Security Rules and indexes
- `firestore-tests/` — automated rules tests against the Firestore emulator
- `.github/workflows/deploy.yml` — CI/CD: PR preview deploys, main-branch production deploys

See the full architecture and design plan at the bottom of this file's project history, or ask for a copy of the build plan.

## One-time project setup

1. Create a Firebase project in the [Firebase Console](https://console.firebase.google.com) and **upgrade it to the Blaze (pay-as-you-go) plan** — required for Cloud Functions and Gemini calls, even though usage stays at effectively $0/month at low volume. Set a GCP budget alert as a safety net (see `functions/src/billingCircuitBreaker.ts`).
2. Enable **Authentication** providers: Google and Email/Password.
3. Enable **Cloud Firestore** (production mode).
4. Get a **Gemini API key** and set it as a Cloud Functions secret: `firebase functions:secrets:set GEMINI_API_KEY`.
5. Replace the placeholder project ID in `.firebaserc` with your real project ID (or run `firebase use --add`).
6. Copy `frontend/.env.example` to `frontend/.env.local` and fill in your Firebase web app config (Project Settings → General → Your apps).
7. For CI/CD, add these GitHub Actions repo secrets: `FIREBASE_SERVICE_ACCOUNT` (a service account JSON with Firebase Hosting/Functions/Firestore deploy permissions), `FIREBASE_PROJECT_ID`, and the six `VITE_FIREBASE_*` values from step 6.
8. **Not yet wired up — do before launch:** enable [Firebase App Check](https://firebase.google.com/docs/app-check) (reCAPTCHA Enterprise or v3 provider for the web app) and call `initializeAppCheck` in `frontend/src/lib/firebase.ts`, then enforce it on Firestore and Cloud Functions in the console. This was in the original security plan as the anti-abuse layer for direct client writes (gym/machine creation) but needs a real Firebase project to configure, so it was left out of this build. Without it, the write-frequency throttling on shared gym/machine data relies only on the field-level validation already in `firestore.rules`.

## Local development

```bash
# Terminal 1 — Firebase emulators (Auth, Firestore, Functions, Pub/Sub)
firebase emulators:start

# Terminal 2 — frontend dev server
cd frontend && npm run dev
```

The frontend connects to local emulators automatically in dev mode (see `frontend/src/lib/firebase.ts`).

## Rules tests

```bash
cd firestore-tests && npm install && npm test
```
