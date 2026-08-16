import { onCall, HttpsError } from "firebase-functions/v2/https";
import type { DocumentData, DocumentReference } from "firebase-admin/firestore";
import { db } from "./admin";

interface ExportedDoc {
  id: string;
  data: DocumentData;
  subcollections: Record<string, ExportedDoc[]>;
}

// Walks the document tree generically via `listCollections()` rather than
// hardcoding each subcollection name, so it automatically covers
// workoutLogs, machineStats (+ its history subcollection), plans
// (+ history), and meta/aiQuota without needing updates as the schema grows.
async function exportDocumentTree(ref: DocumentReference): Promise<ExportedDoc> {
  const snap = await ref.get();
  const data = snap.data() ?? {};

  const subcollections: Record<string, ExportedDoc[]> = {};
  const collections = await ref.listCollections();

  for (const col of collections) {
    const docs = await col.listDocuments();
    subcollections[col.id] = await Promise.all(docs.map((d) => exportDocumentTree(d)));
  }

  return { id: ref.id, data, subcollections };
}

export const exportUserData = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in to export your data.");
  }
  const uid = request.auth.uid;

  return exportDocumentTree(db.doc(`users/${uid}`));
});
