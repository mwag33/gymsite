import { useState } from "react";
import { addDoc, collection, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { MACHINE_CATEGORIES } from "../../lib/types";
import type { MachineCategory } from "../../lib/types";

interface SimpleLogViewProps {
  uid: string;
  gymId: string | null;
  onLogged: (logId: string) => void;
}

const TODAY_LABEL = new Date().toLocaleDateString(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
});

export function SimpleLogView({ uid, gymId, onLogged }: SimpleLogViewProps) {
  const [selected, setSelected] = useState<MachineCategory | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (!selected || saving) return;
    setSaving(true);
    setError(null);
    try {
      const ref = await addDoc(collection(db, "users", uid, "workoutLogs"), {
        mode: "simple" as const,
        gymId,
        date: Timestamp.now(),
        bodyParts: [selected],
        createdAt: serverTimestamp(),
      });
      setSelected(null);
      setNote("");
      onLogged(ref.id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't save your workout. Please try again."
      );
    } finally {
      setSaving(false);
    }
  }

  const selectedLabel = MACHINE_CATEGORIES.find((c) => c.value === selected)?.label ?? "";

  return (
    <div className="log-simple">
      <div className="log-category-grid">
        {MACHINE_CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            type="button"
            className={
              "log-category-card" + (selected === cat.value ? " log-category-card-active" : "")
            }
            onClick={() => setSelected(cat.value)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {selected && (
        <div className="card log-confirm-panel">
          <p className="log-confirm-title">{selectedLabel}</p>
          <p className="log-confirm-date">{TODAY_LABEL}</p>

          <label className="log-note-label" htmlFor="log-note">
            Note (optional)
          </label>
          {/*
            Not persisted: isValidWorkoutLog() in firestore.rules only allows
            mode/gymId/date/bodyParts/exercises/createdAt on this doc — any
            extra field (including a note) is rejected by hasOnly(). This
            stays local-only UI until the schema/rules add a field for it.
          */}
          <textarea
            id="log-note"
            className="log-note-input"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. felt strong today"
          />

          {error && <p className="log-error-text">{error}</p>}

          <div className="log-confirm-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setSelected(null)}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleConfirm}
              disabled={saving}
            >
              {saving ? "Logging..." : "Log it"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
