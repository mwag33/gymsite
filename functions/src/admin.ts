import { getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAuth, type Auth } from "firebase-admin/auth";

// Initialize the Admin SDK exactly once, regardless of how many function
// files import from here (module caching makes this safe across triggers).
const app: App = getApps().length > 0 ? getApps()[0] : initializeApp();

export const db: Firestore = getFirestore(app);
export const auth: Auth = getAuth(app);
