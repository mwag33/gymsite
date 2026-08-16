import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  addDoc,
  collection,
  doc,
  documentId,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../contexts/AuthContext";
import { useActiveGym } from "../../contexts/ActiveGymContext";
import {
  MACHINE_CATEGORIES,
  type Gym,
  type Machine,
  type MachineCategory,
} from "../../lib/types";
import { MACHINE_CATALOG, findCatalogMachine } from "../../lib/machineCatalog";
import { createMachine } from "../../lib/createMachine";
import { addHomeGym } from "../../lib/callables";
import { FocusIcon } from "../../features/plan/focusIcons";
import MachineIcon from "../../components/MachineIcon";
import MuscleDiagram from "../../components/MuscleDiagram";

type GymDoc = Gym & { id: string };
type MachineDoc = Machine & { id: string };

function formatLocation(location: Gym["location"]): string {
  if (!location) return "No location set";
  return location.country ? `${location.city}, ${location.country}` : location.city;
}

export default function GymPage() {
  const { user, profile } = useAuth();
  const { activeGym, loading: activeGymLoading, setActiveGymId } = useActiveGym();

  // ---------- Your gyms (homeGymIds quick-switch row) ----------
  const homeGymIds = useMemo(() => profile?.homeGymIds ?? [], [profile?.homeGymIds]);
  const [homeGyms, setHomeGyms] = useState<GymDoc[] | null>(null);
  const [backfilled, setBackfilled] = useState(false);

  useEffect(() => {
    if (homeGymIds.length === 0) {
      setHomeGyms([]);
      return;
    }
    // documentId() "in" queries cap at 30 ids - homeGymIds realistically
    // never approaches that, so no pagination/chunking is needed here.
    let cancelled = false;
    getDocs(query(collection(db, "gyms"), where(documentId(), "in", homeGymIds.slice(0, 30))))
      .then((snap) => {
        if (cancelled) return;
        const byId = new Map(snap.docs.map((d) => [d.id, { id: d.id, ...(d.data() as Omit<Gym, "id">) }]));
        // Preserve homeGymIds order (roughly most-recently-added-last) rather
        // than whatever order the query happens to return.
        setHomeGyms(homeGymIds.map((id) => byId.get(id)).filter((g): g is GymDoc => Boolean(g)));
      })
      .catch(() => setHomeGyms([]));
    return () => {
      cancelled = true;
    };
  }, [homeGymIds]);

  // One-time backfill for pre-existing users: before this feature shipped,
  // switching/creating a gym never saved it into homeGymIds, so anyone who
  // already set up a gym would otherwise see an empty "Your gyms" row.
  useEffect(() => {
    if (backfilled || activeGymLoading || !activeGym) return;
    if (homeGymIds.length > 0) return;
    setBackfilled(true);
    void addHomeGym(activeGym.id);
  }, [backfilled, activeGymLoading, activeGym, homeGymIds.length]);

  // ---------- Gym search / switch / create ----------
  const [switchRequested, setSwitchRequested] = useState(false);
  const showGymPanel = switchRequested || (!activeGymLoading && !activeGym);

  const [gymQuery, setGymQuery] = useState("");
  const [allGyms, setAllGyms] = useState<GymDoc[]>([]);
  const [gymsLoaded, setGymsLoaded] = useState(false);
  const [gymsLoading, setGymsLoading] = useState(false);
  const [gymsError, setGymsError] = useState<string | null>(null);

  const [adoptingGymId, setAdoptingGymId] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);

  const [showAddGymForm, setShowAddGymForm] = useState(false);
  const [newGymName, setNewGymName] = useState("");
  const [newGymCity, setNewGymCity] = useState("");
  const [newGymCountry, setNewGymCountry] = useState("");
  const [creatingGym, setCreatingGym] = useState(false);
  const [createGymError, setCreateGymError] = useState<string | null>(null);

  useEffect(() => {
    if (!showGymPanel || gymsLoaded) return;
    setGymsLoading(true);
    setGymsError(null);
    getDocs(query(collection(db, "gyms"), orderBy("name"), limit(100)))
      .then((snap) => {
        setAllGyms(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Gym, "id">) })));
        setGymsLoaded(true);
      })
      .catch((err) => {
        setGymsError(err instanceof Error ? err.message : "Couldn't load gyms.");
      })
      .finally(() => setGymsLoading(false));
  }, [showGymPanel, gymsLoaded]);

  const filteredGyms = useMemo(() => {
    const q = gymQuery.trim().toLowerCase();
    if (!q) return allGyms;
    return allGyms.filter((g) => g.name.toLowerCase().includes(q));
  }, [allGyms, gymQuery]);

  async function handleAdoptGym(gymId: string) {
    setAdoptingGymId(gymId);
    setSwitchError(null);
    try {
      await setActiveGymId(gymId);
      await addHomeGym(gymId);
      // v1 approximation: bump memberCount on every activation rather than
      // tracking exact-once membership per user (out of scope for now).
      await updateDoc(doc(db, "gyms", gymId), { memberCount: increment(1) });
      setSwitchRequested(false);
      setGymQuery("");
    } catch (err) {
      setSwitchError(err instanceof Error ? err.message : "Couldn't switch gyms.");
    } finally {
      setAdoptingGymId(null);
    }
  }

  async function handleCreateGym(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    const name = newGymName.trim();
    if (!name) return;
    setCreatingGym(true);
    setCreateGymError(null);
    try {
      const city = newGymCity.trim();
      const location = city ? { city, country: newGymCountry.trim() } : null;
      const gymRef = await addDoc(collection(db, "gyms"), {
        name,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        memberCount: 0,
        location,
      });
      await setActiveGymId(gymRef.id);
      await addHomeGym(gymRef.id);
      await updateDoc(gymRef, { memberCount: increment(1) });
      setShowAddGymForm(false);
      setSwitchRequested(false);
      setNewGymName("");
      setNewGymCity("");
      setNewGymCountry("");
      setGymQuery("");
      setGymsLoaded(false); // refetch next time the panel opens so the new gym is searchable
    } catch (err) {
      setCreateGymError(err instanceof Error ? err.message : "Couldn't create gym.");
    } finally {
      setCreatingGym(false);
    }
  }

  // ---------- Machines for the active gym ----------
  const [machines, setMachines] = useState<MachineDoc[] | null>(null);
  const [machineQuery, setMachineQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<MachineCategory | null>(null);

  const [showAddMachineForm, setShowAddMachineForm] = useState(false);
  const [newMachineName, setNewMachineName] = useState("");
  const [newMachineCategory, setNewMachineCategory] = useState<MachineCategory>(
    MACHINE_CATEGORIES[0].value
  );
  const [addingMachine, setAddingMachine] = useState(false);
  const [addMachineError, setAddMachineError] = useState<string | null>(null);

  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());
  const [machinesError, setMachinesError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeGym) {
      setMachines(null);
      return;
    }
    setMachines(null); // show loading state while the new gym's machines load
    setMachinesError(null);
    setSelectedCategory(null); // a category filter from the old gym shouldn't silently hide everything in the new one
    const q = query(
      collection(db, "gyms", activeGym.id, "machines"),
      where("archived", "==", false)
    );
    return onSnapshot(
      q,
      (snap) => {
        setMachines(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Machine, "id">) })));
      },
      (err) => {
        setMachinesError(err instanceof Error ? err.message : "Couldn't load machines.");
      }
    );
  }, [activeGym?.id]);

  const filteredMachines = useMemo(() => {
    if (!machines) return [];
    const q = machineQuery.trim().toLowerCase();
    return q ? machines.filter((m) => m.name.toLowerCase().includes(q)) : machines;
  }, [machines, machineQuery]);

  const machinesByCategory = useMemo(() => {
    const map = new Map<MachineCategory, MachineDoc[]>();
    for (const m of filteredMachines) {
      const list = map.get(m.category) ?? [];
      list.push(m);
      map.set(m.category, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    return map;
  }, [filteredMachines]);

  // MACHINE_CATEGORIES drives labels/order, but the schema still allows an
  // "other" category (e.g. legacy/edge-case data) that isn't offered in the
  // add-machine select below. Fall back to an "Other" section so those
  // machines are never silently hidden from the list.
  const categorySections = useMemo(() => {
    const sections = [...MACHINE_CATEGORIES];
    if (machinesByCategory.has("other") && !sections.some((s) => s.value === "other")) {
      sections.push({ value: "other", label: "Other" });
    }
    return sections.filter((s) => machinesByCategory.has(s.value));
  }, [machinesByCategory]);

  // The card grid renders one flat list - chips narrow it to a single
  // category, "All" (selectedCategory === null) shows every section's cards
  // sorted by name so the grid isn't visually chunked by category twice.
  const visibleMachines = useMemo(() => {
    const list = selectedCategory
      ? (machinesByCategory.get(selectedCategory) ?? [])
      : filteredMachines;
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredMachines, machinesByCategory, selectedCategory]);

  async function handleAddMachine(e: FormEvent) {
    e.preventDefault();
    if (!user || !activeGym) return;
    const name = newMachineName.trim();
    if (!name) return;
    setAddingMachine(true);
    setAddMachineError(null);
    try {
      await createMachine(activeGym.id, user.uid, name, newMachineCategory);
      setNewMachineName("");
      setNewMachineCategory(MACHINE_CATEGORIES[0].value);
      setShowAddMachineForm(false);
    } catch (err) {
      setAddMachineError(err instanceof Error ? err.message : "Couldn't add machine.");
    } finally {
      setAddingMachine(false);
    }
  }

  // ---------- Quick-add common machines ----------
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [selectedCatalogIds, setSelectedCatalogIds] = useState<Set<string>>(new Set());
  const [quickAdding, setQuickAdding] = useState(false);
  const [quickAddError, setQuickAddError] = useState<string | null>(null);

  const existingMachineNames = useMemo(
    () => new Set((machines ?? []).map((m) => m.name.toLowerCase())),
    [machines]
  );

  const availableCatalogMachines = useMemo(
    () => MACHINE_CATALOG.filter((c) => !existingMachineNames.has(c.name.toLowerCase())),
    [existingMachineNames]
  );

  function toggleCatalogSelection(id: string) {
    setSelectedCatalogIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleQuickAdd() {
    if (!user || !activeGym || selectedCatalogIds.size === 0) return;
    setQuickAdding(true);
    setQuickAddError(null);
    try {
      const toAdd = MACHINE_CATALOG.filter((c) => selectedCatalogIds.has(c.id));
      await Promise.all(toAdd.map((c) => createMachine(activeGym.id, user.uid, c.name, c.category)));
      setSelectedCatalogIds(new Set());
      setShowQuickAdd(false);
    } catch (err) {
      setQuickAddError(err instanceof Error ? err.message : "Couldn't add machines.");
    } finally {
      setQuickAdding(false);
    }
  }

  function handleReportDuplicate(machineId: string) {
    // v1 stub: there's no moderation queue or Cloud Function for duplicate
    // reports yet, so this just acknowledges the click locally.
    setReportedIds((prev) => {
      const next = new Set(prev);
      next.add(machineId);
      return next;
    });
  }

  return (
    <div className="gym-page">
      {homeGyms && homeGyms.length > 1 && (
        <section className="gym-your-gyms">
          <p className="gym-section-label">Your gyms</p>
          <div className="gym-your-gyms-row" role="list">
            {homeGyms.map((g) => {
              const isActive = g.id === activeGym?.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  role="listitem"
                  className={"gym-card" + (isActive ? " gym-card-active" : "")}
                  disabled={isActive || adoptingGymId === g.id}
                  onClick={() => handleAdoptGym(g.id)}
                >
                  <span className="gym-card-name">{g.name}</span>
                  <span className="gym-card-location">{formatLocation(g.location)}</span>
                  {isActive && <span className="gym-card-badge">Active</span>}
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="card gym-active-card">
        {activeGymLoading ? (
          <p className="muted">Loading your gym…</p>
        ) : activeGym ? (
          <div className="gym-active-header">
            <div>
              <h2>{activeGym.name}</h2>
              <p className="muted small">
                {formatLocation(activeGym.location)}
                {" · "}
                {machines ? `${machines.length} machine${machines.length === 1 ? "" : "s"}` : "…"}
              </p>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setSwitchRequested((v) => !v)}
            >
              {switchRequested ? "Cancel" : homeGyms && homeGyms.length > 1 ? "Find another gym" : "Switch gym"}
            </button>
          </div>
        ) : (
          <div className="gym-empty-state">
            <h2>Find your gym</h2>
            <p className="muted">
              Search for your gym below, or add it if it isn't listed yet, so you can
              track the machines you train on.
            </p>
          </div>
        )}
      </section>

      {showGymPanel && (
        <section className="card gym-switch-panel">
          <input
            type="text"
            placeholder="Search gyms by name"
            aria-label="Search gyms"
            value={gymQuery}
            onChange={(e) => setGymQuery(e.target.value)}
            className="gym-input"
          />

          {gymsError && <p className="error-text">{gymsError}</p>}
          {switchError && <p className="error-text">{switchError}</p>}

          {gymsLoading ? (
            <p className="muted">Loading gyms…</p>
          ) : (
            <ul className="gym-result-list">
              {filteredGyms.map((g) => {
                const isCurrent = g.id === activeGym?.id;
                return (
                  <li key={g.id} className="gym-result-row">
                    <div>
                      <div className="gym-result-name">{g.name}</div>
                      <div className="muted small">
                        {formatLocation(g.location)} · {g.memberCount} member
                        {g.memberCount === 1 ? "" : "s"}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={isCurrent || adoptingGymId === g.id}
                      onClick={() => handleAdoptGym(g.id)}
                    >
                      {isCurrent
                        ? "Current"
                        : adoptingGymId === g.id
                          ? "Switching…"
                          : "Use this gym"}
                    </button>
                  </li>
                );
              })}
              {filteredGyms.length === 0 && (
                <li className="muted">No gyms match “{gymQuery || "your search"}”.</li>
              )}
            </ul>
          )}

          {!showAddGymForm ? (
            <button
              type="button"
              className="btn btn-secondary gym-add-toggle"
              onClick={() => setShowAddGymForm(true)}
            >
              + Add new gym
            </button>
          ) : (
            <form onSubmit={handleCreateGym} className="gym-add-form">
              <input
                required
                maxLength={80}
                placeholder="Gym name"
                aria-label="Gym name"
                value={newGymName}
                onChange={(e) => setNewGymName(e.target.value)}
                className="gym-input"
              />
              <div className="gym-form-row">
                <input
                  placeholder="City (optional)"
                  aria-label="City"
                  value={newGymCity}
                  onChange={(e) => setNewGymCity(e.target.value)}
                  className="gym-input"
                />
                <input
                  placeholder="Country (optional)"
                  aria-label="Country"
                  value={newGymCountry}
                  onChange={(e) => setNewGymCountry(e.target.value)}
                  className="gym-input"
                />
              </div>
              {createGymError && <p className="error-text">{createGymError}</p>}
              <div className="gym-form-row">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowAddGymForm(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={creatingGym || !newGymName.trim()}
                >
                  {creatingGym ? "Creating…" : "Create & use"}
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {activeGym && (
        <section className="gym-machines-section">
          <div className="gym-machines-header">
            <h3>Machines</h3>
            <div className="gym-machines-header-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowQuickAdd((v) => !v)}
              >
                {showQuickAdd ? "Cancel" : "Quick add common machines"}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowAddMachineForm((v) => !v)}
              >
                {showAddMachineForm ? "Cancel" : "+ Add machine"}
              </button>
            </div>
          </div>

          {showQuickAdd && (
            <div className="card gym-quick-add">
              {availableCatalogMachines.length === 0 ? (
                <p className="muted">
                  All 20 common machines are already listed for this gym.
                </p>
              ) : (
                <>
                  <ul className="gym-quick-add-list">
                    {availableCatalogMachines.map((c) => (
                      <li key={c.id} className="gym-quick-add-row">
                        <label className="gym-quick-add-label">
                          <input
                            type="checkbox"
                            checked={selectedCatalogIds.has(c.id)}
                            onChange={() => toggleCatalogSelection(c.id)}
                          />
                          <MachineIcon iconId={c.id} image={c.image} />
                          <span className="gym-quick-add-name">{c.name}</span>
                        </label>
                        <MuscleDiagram targetMuscles={c.primaryMuscles} />
                      </li>
                    ))}
                  </ul>
                  {quickAddError && <p className="error-text">{quickAddError}</p>}
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={quickAdding || selectedCatalogIds.size === 0}
                    onClick={handleQuickAdd}
                  >
                    {quickAdding
                      ? "Adding…"
                      : `Add selected${selectedCatalogIds.size > 0 ? ` (${selectedCatalogIds.size})` : ""}`}
                  </button>
                </>
              )}
            </div>
          )}

          {showAddMachineForm && (
            <form onSubmit={handleAddMachine} className="card gym-add-form">
              <input
                required
                maxLength={80}
                placeholder="Machine name"
                aria-label="Machine name"
                value={newMachineName}
                onChange={(e) => setNewMachineName(e.target.value)}
                className="gym-input"
              />
              <select
                value={newMachineCategory}
                aria-label="Machine category"
                onChange={(e) => setNewMachineCategory(e.target.value as MachineCategory)}
                className="gym-input"
              >
                {MACHINE_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              {addMachineError && <p className="error-text">{addMachineError}</p>}
              <button
                type="submit"
                className="btn btn-primary"
                disabled={addingMachine || !newMachineName.trim()}
              >
                {addingMachine ? "Adding…" : "Add machine"}
              </button>
            </form>
          )}

          {machinesError && <p className="error-text">{machinesError}</p>}

          {machines === null ? (
            <p className="muted">Loading machines…</p>
          ) : machines.length === 0 ? (
            <div className="card gym-empty-state">
              <p>No machines logged for this gym yet.</p>
              <p className="muted">
                Be the first to add a machine here; it'll show up for everyone at this
                gym right away.
              </p>
            </div>
          ) : (
            <>
              <input
                type="text"
                placeholder="Search machines"
                aria-label="Search machines"
                value={machineQuery}
                onChange={(e) => setMachineQuery(e.target.value)}
                className="gym-input gym-machine-search"
              />

              <div className="gym-category-chips" role="list">
                <button
                  type="button"
                  role="listitem"
                  className={"gym-chip" + (selectedCategory === null ? " gym-chip-active" : "")}
                  onClick={() => setSelectedCategory(null)}
                >
                  All
                </button>
                {categorySections.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    role="listitem"
                    className={"gym-chip" + (selectedCategory === c.value ? " gym-chip-active" : "")}
                    onClick={() => setSelectedCategory(c.value)}
                  >
                    {c.value !== "other" && <FocusIcon focus={c.value} width={14} height={14} />}
                    {c.label}
                    <span className="gym-chip-count">{machinesByCategory.get(c.value)?.length ?? 0}</span>
                  </button>
                ))}
              </div>

              {visibleMachines.length === 0 ? (
                <p className="muted">No machines match “{machineQuery}”.</p>
              ) : (
                <div className="gym-machine-grid">
                  {visibleMachines.map((m) => {
                    const catalogMatch = findCatalogMachine(m.name);
                    return (
                      <div key={m.id} className="gym-machine-card">
                        <div className="gym-machine-card-icon">
                          <MachineIcon
                            iconId={catalogMatch?.id ?? ""}
                            image={catalogMatch?.image}
                            width={64}
                            height={64}
                          />
                        </div>
                        <span className="gym-machine-card-name">{m.name}</span>
                        {catalogMatch && (
                          <div className="gym-machine-card-diagram">
                            <MuscleDiagram targetMuscles={catalogMatch.primaryMuscles} />
                          </div>
                        )}
                        <button
                          type="button"
                          className="gym-report-btn"
                          disabled={reportedIds.has(m.id)}
                          onClick={() => handleReportDuplicate(m.id)}
                        >
                          {reportedIds.has(m.id) ? "Thanks, we'll take a look" : "Report duplicate"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </section>
      )}

      <style>{`
        .gym-page {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }
        .muted {
          color: var(--text-muted);
        }
        .small {
          font-size: 13px;
        }
        .error-text {
          color: var(--danger);
          font-size: 13px;
        }
        .gym-active-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-3);
        }
        .gym-active-header h2 {
          font-size: 18px;
        }
        .gym-empty-state {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }
        .gym-switch-panel {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
        }
        .gym-input {
          width: 100%;
          padding: var(--space-3);
          border-radius: var(--radius-md);
          border: 1px solid var(--border);
          background: var(--surface-raised);
          color: var(--text);
        }
        .gym-result-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
          max-height: 320px;
          overflow-y: auto;
        }
        .gym-result-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-3);
          padding: var(--space-2) 0;
          border-bottom: 1px solid var(--border);
        }
        .gym-result-row:last-child {
          border-bottom: none;
        }
        .gym-result-name {
          font-weight: 500;
        }
        .gym-add-toggle {
          width: 100%;
        }
        .gym-add-form {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
        }
        .gym-form-row {
          display: flex;
          gap: var(--space-2);
        }
        .gym-form-row > * {
          flex: 1;
        }
        .gym-machines-section {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }
        .gym-machines-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-3);
          flex-wrap: wrap;
        }
        .gym-machines-header h3 {
          font-size: 16px;
        }
        .gym-machines-header-actions {
          display: flex;
          gap: var(--space-2);
          flex-wrap: wrap;
        }
        .gym-quick-add {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
        }
        .gym-quick-add-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
          max-height: 360px;
          overflow-y: auto;
        }
        .gym-quick-add-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-3);
          padding: var(--space-2) var(--space-3);
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
        }
        .gym-quick-add-label {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          cursor: pointer;
        }
        .gym-quick-add-name {
          font-size: 14px;
        }
        .gym-machine-search {
          margin-bottom: var(--space-1);
        }
        .gym-report-btn {
          background: none;
          border: none;
          color: var(--text-muted);
          font-size: 12px;
          cursor: pointer;
          padding: 0;
          text-decoration: underline;
          white-space: nowrap;
        }
        .gym-report-btn:disabled {
          color: var(--success);
          text-decoration: none;
          cursor: default;
        }

        .gym-your-gyms {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }
        .gym-section-label {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.03em;
          margin: 0 0 var(--space-2);
        }
        .gym-your-gyms-row {
          display: flex;
          gap: var(--space-3);
          overflow-x: auto;
          scroll-snap-type: x mandatory;
          padding-bottom: var(--space-1);
          -webkit-overflow-scrolling: touch;
        }
        .gym-your-gyms-row::-webkit-scrollbar {
          display: none;
        }
        .gym-card {
          scroll-snap-align: start;
          flex-shrink: 0;
          width: 160px;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 2px;
          padding: var(--space-3) var(--space-4);
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          color: var(--text);
          text-align: left;
          cursor: pointer;
          position: relative;
        }
        .gym-card:disabled {
          cursor: default;
        }
        .gym-card-active {
          border-color: var(--accent);
          background: var(--accent-surface);
        }
        .gym-card-name {
          font-size: 15px;
          font-weight: 600;
        }
        .gym-card-location {
          font-size: 12px;
          color: var(--text-muted);
        }
        .gym-card-badge {
          position: absolute;
          top: var(--space-2);
          right: var(--space-2);
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--accent);
        }

        .gym-category-chips {
          display: flex;
          gap: var(--space-2);
          overflow-x: auto;
          padding-bottom: var(--space-1);
          -webkit-overflow-scrolling: touch;
        }
        .gym-category-chips::-webkit-scrollbar {
          display: none;
        }
        .gym-chip {
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          gap: var(--space-1);
          padding: var(--space-2) var(--space-3);
          border-radius: 999px;
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--text-muted);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }
        .gym-chip-active {
          border-color: var(--accent);
          background: var(--accent-surface);
          color: var(--accent);
        }
        .gym-chip-count {
          color: inherit;
          opacity: 0.65;
          font-size: 12px;
        }

        .gym-machine-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
          gap: var(--space-3);
        }
        .gym-machine-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: var(--space-2);
          padding: var(--space-4) var(--space-3);
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
        }
        .gym-machine-card-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 64px;
          height: 64px;
          color: var(--text-muted);
        }
        .gym-machine-card-name {
          font-size: 14px;
          font-weight: 600;
        }
        .gym-machine-card-diagram {
          opacity: 0.85;
        }
      `}</style>
    </div>
  );
}
