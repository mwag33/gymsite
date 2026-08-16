// Single-session fork of PlanEditor's row/add-exercise UI — used from
// SessionDetailPage's "Edit just this day" action. PlanEditor already
// operates on a `Session[]` slice and writes through `updateSession` per
// session id, so this is a thin single-element wrapper rather than a
// reimplementation.
import type { Session } from "../../lib/types";
import PlanEditor from "./PlanEditor";

interface SessionEditorProps {
  session: Session;
  onSaved: (session: Session) => void;
  onCancel: () => void;
}

export default function SessionEditor({ session, onSaved, onCancel }: SessionEditorProps) {
  return (
    <PlanEditor
      sessions={[session]}
      onCancel={onCancel}
      onSaved={(sessions) => onSaved(sessions[0] ?? session)}
    />
  );
}
