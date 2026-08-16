// Single write site for adding a machine to a gym's roster. Factored out of
// GymPage.tsx's original inline addDoc so MachinePicker (search-while-logging)
// and the Gym page's own "+ Add machine" form share one implementation.
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import type { MachineCategory } from "./types";

/** Creates a machine doc under gyms/{gymId}/machines and returns its new id. */
export async function createMachine(
  gymId: string,
  uid: string,
  name: string,
  category: MachineCategory
): Promise<string> {
  const ref = await addDoc(collection(db, "gyms", gymId, "machines"), {
    name,
    category,
    addedBy: uid,
    createdAt: serverTimestamp(),
    archived: false,
  });
  return ref.id;
}
