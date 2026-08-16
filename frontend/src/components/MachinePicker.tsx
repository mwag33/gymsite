// Shared "find or add a machine" panel used both when a planned exercise
// doesn't resolve to a gym machine (SessionLogList) and when browsing the
// catalog search comes up empty (CatalogLogView). Takes the caller's
// already-subscribed `machines` array rather than opening a second
// onSnapshot listener. Renders inside the log-page style scope: all of its
// classes (.log-search-input/.log-machine-*/.log-set-panel-header/
// .log-panel-close plus .machine-picker*) live in LogWorkoutPage.tsx's
// <style> block, same convention SetEditor.tsx already relies on — this
// component has no <style> of its own, and CatalogLogView's inline "add
// machine" affordance reuses the same .machine-picker-create* classes.
import { useMemo, useState } from "react";
import { MACHINE_CATEGORIES } from "../lib/types";
import type { Machine, MachineCategory } from "../lib/types";
import { findCatalogMachine } from "../lib/machineCatalog";
import { createMachine } from "../lib/createMachine";
import MachineIcon from "./MachineIcon";

interface MachinePickerProps {
  gymId: string;
  uid: string;
  machines: Machine[];
  initialQuery?: string;
  defaultCategory?: MachineCategory;
  title?: string;
  onSelect: (machine: Machine) => void;
  onClose: () => void;
}

export default function MachinePicker({
  gymId,
  uid,
  machines,
  initialQuery = "",
  defaultCategory,
  title = "Find or add a machine",
  onSelect,
  onClose,
}: MachinePickerProps) {
  const [search, setSearch] = useState(initialQuery);
  const [category, setCategory] = useState<MachineCategory>(
    defaultCategory ?? MACHINE_CATEGORIES[0].value
  );
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = search.trim();

  const filtered = useMemo(() => {
    if (!trimmed) return machines;
    const q = trimmed.toLowerCase();
    return machines.filter((m) => m.name.toLowerCase().includes(q));
  }, [machines, trimmed]);

  const hasExactMatch = useMemo(
    () => machines.some((m) => m.name.trim().toLowerCase() === trimmed.toLowerCase()),
    [machines, trimmed]
  );

  const grouped = useMemo(() => {
    const map = new Map<MachineCategory, Machine[]>();
    for (const m of filtered) {
      const list = map.get(m.category) ?? [];
      list.push(m);
      map.set(m.category, list);
    }
    return map;
  }, [filtered]);

  async function handleCreate() {
    if (!trimmed || creating) return;
    setCreating(true);
    setError(null);
    try {
      const id = await createMachine(gymId, uid, trimmed, category);
      onSelect({ id, name: trimmed, category, addedBy: uid, createdAt: null, archived: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add that machine. Please try again.");
      setCreating(false);
    }
  }

  return (
    <div className="card machine-picker">
      <div className="log-set-panel-header">
        <p className="log-set-panel-title">{title}</p>
        <button type="button" className="log-panel-close" onClick={onClose} aria-label="Close">
          &times;
        </button>
      </div>

      <input
        type="search"
        className="log-search-input"
        placeholder="Search machines..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        autoFocus
      />

      {MACHINE_CATEGORIES.map((c) => {
        const list = grouped.get(c.value);
        if (!list || list.length === 0) return null;
        return (
          <div key={c.value} className="log-machine-group">
            <p className="log-machine-group-title">{c.label}</p>
            <div className="log-machine-list">
              {list.map((m) => {
                const catalogMatch = findCatalogMachine(m.name);
                return (
                  <button key={m.id} type="button" className="log-machine-row" onClick={() => onSelect(m)}>
                    <span className="machine-picker-row-main">
                      <MachineIcon iconId={catalogMatch?.id ?? ""} image={catalogMatch?.image} width={28} height={28} />
                      <span>{m.name}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {filtered.length === 0 && trimmed && (
        <p className="log-status-muted">No machines match "{trimmed}".</p>
      )}

      {trimmed && !hasExactMatch && (
        <div className="machine-picker-create">
          <p className="log-machine-group-title">Not listed?</p>
          <div className="machine-picker-create-row">
            <select
              className="log-search-input machine-picker-select"
              value={category}
              aria-label="New machine category"
              onChange={(e) => setCategory(e.target.value as MachineCategory)}
            >
              {MACHINE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-primary" disabled={creating} onClick={handleCreate}>
              {creating ? "Adding..." : `Add "${trimmed}"`}
            </button>
          </div>
        </div>
      )}

      {error && <p className="log-error-text">{error}</p>}
    </div>
  );
}
