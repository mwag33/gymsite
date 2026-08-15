import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { deleteAccount, exportUserData, updateUserSettings } from "../../lib/callables";
import { GOAL_OPTIONS, type UserSettings } from "../../lib/types";
import { ChevronRightIcon } from "../../components/icons";
import { LoadingScreen } from "../../components/LoadingScreen";

const EXPERIENCE_LABELS: Record<string, string> = {
  new: "New to training",
  some_experience: "Some experience",
  experienced: "Experienced",
};

type FieldStatus = "idle" | "saving" | "saved" | "error";

export default function ProfilePage() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();

  // Settings controls are bound to local state so a toggle/select reflects
  // the change instantly (optimistic), while the callable round-trips and
  // the Firestore listener in AuthContext confirms it in the background.
  const [settings, setSettings] = useState<UserSettings | null>(profile?.settings ?? null);
  const [fieldStatus, setFieldStatus] = useState<Partial<Record<keyof UserSettings, FieldStatus>>>({});

  useEffect(() => {
    if (profile?.settings) setSettings(profile.settings);
  }, [profile?.settings]);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const [deleteStep, setDeleteStep] = useState<"idle" | "confirming">("idle");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (!profile || !settings) {
    return <LoadingScreen label="Loading profile..." />;
  }

  async function handleSettingChange<K extends keyof UserSettings>(
    key: K,
    value: UserSettings[K]
  ) {
    const previous = settings;
    setSettings((current) => (current ? { ...current, [key]: value } : current));
    setFieldStatus((current) => ({ ...current, [key]: "saving" }));
    try {
      await updateUserSettings({ [key]: value } as Partial<UserSettings>);
      setFieldStatus((current) => ({ ...current, [key]: "saved" }));
      window.setTimeout(() => {
        setFieldStatus((current) => ({ ...current, [key]: "idle" }));
      }, 1500);
    } catch (err) {
      setSettings(previous);
      setFieldStatus((current) => ({ ...current, [key]: "error" }));
      console.error(`Failed to update ${String(key)}`, err);
    }
  }

  async function handleSignOut() {
    await signOut();
    navigate("/signin", { replace: true });
  }

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    try {
      const data = await exportUserData();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `my-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError("Couldn't export your data. Please try again.");
      console.error(err);
    } finally {
      setExporting(false);
    }
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAccount();
      await signOut();
      navigate("/signin", { replace: true });
    } catch (err) {
      setDeleteError("Couldn't delete your account. Please try again or contact support.");
      setDeleting(false);
      console.error(err);
    }
  }

  const goalOption = GOAL_OPTIONS.find((g) => g.value === profile.goal);

  return (
    <div className="profile-page">
      <section className="card profile-section">
        <h2>Account</h2>
        <p className="profile-name">{profile.displayName || "No name set"}</p>
        <p className="profile-muted">{user?.email ?? profile.email ?? "No email on file"}</p>
        <button type="button" className="btn btn-secondary" onClick={handleSignOut}>
          Sign out
        </button>
      </section>

      <section className="card profile-section">
        <h2>Goal &amp; training preferences</h2>
        <dl className="profile-info-grid">
          <dt className="profile-muted">Goal</dt>
          <dd>{goalOption?.label ?? "Not set"}</dd>
          <dt className="profile-muted">Experience</dt>
          <dd>
            {profile.experienceLevel ? EXPERIENCE_LABELS[profile.experienceLevel] : "Not set"}
          </dd>
          <dt className="profile-muted">Frequency</dt>
          <dd>{profile.daysPerWeek ? `${profile.daysPerWeek}x per week` : "Not set"}</dd>
          <dt className="profile-muted">Session length</dt>
          <dd>{profile.sessionLengthMinutes ? `${profile.sessionLengthMinutes} min` : "Not set"}</dd>
        </dl>
        <p className="profile-muted profile-hint">
          Your goal drives the whole plan, so changing it means going through onboarding again.
        </p>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => navigate("/onboarding")}
        >
          Retake onboarding
        </button>
      </section>

      <section className="card profile-section">
        <h2>Settings</h2>

        <div className="setting-row">
          <div>
            <p className="setting-label">Units</p>
            <p className="profile-muted setting-hint">Used for weights across the app</p>
          </div>
          <div className="segmented" role="group" aria-label="Units">
            <button
              type="button"
              className={
                "segmented-option" +
                (settings.units === "metric" ? " segmented-option-active" : "")
              }
              aria-pressed={settings.units === "metric"}
              onClick={() => handleSettingChange("units", "metric")}
            >
              Metric (kg)
            </button>
            <button
              type="button"
              className={
                "segmented-option" +
                (settings.units === "imperial" ? " segmented-option-active" : "")
              }
              aria-pressed={settings.units === "imperial"}
              onClick={() => handleSettingChange("units", "imperial")}
            >
              Imperial (lb)
            </button>
          </div>
        </div>
        <SaveIndicator status={fieldStatus.units} />

        <div className="setting-row">
          <div>
            <p className="setting-label">Week starts on</p>
            <p className="profile-muted setting-hint">Controls how your weekly plan is laid out</p>
          </div>
          <select
            className="setting-select"
            value={settings.weekStartsOn === 0 ? "0" : "1"}
            onChange={(e) => handleSettingChange("weekStartsOn", Number(e.target.value))}
          >
            <option value="1">Monday</option>
            <option value="0">Sunday</option>
          </select>
        </div>
        <SaveIndicator status={fieldStatus.weekStartsOn} />

        <div className="setting-row">
          <div>
            <p className="setting-label">Notifications</p>
            <p className="profile-muted setting-hint">Reminders about your training plan</p>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={settings.notificationsEnabled}
              onChange={(e) => handleSettingChange("notificationsEnabled", e.target.checked)}
              aria-label="Notifications"
            />
            <span className="toggle-track">
              <span className="toggle-thumb" />
            </span>
          </label>
        </div>
        <SaveIndicator status={fieldStatus.notificationsEnabled} />
      </section>

      <section className="card profile-section">
        <h2>Data &amp; privacy</h2>
        <div className="data-privacy-row">
          <div>
            <p className="setting-label">Export my data</p>
            <p className="profile-muted setting-hint">
              Download everything we have stored about you as a JSON file.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? "Exporting..." : "Export"}
          </button>
        </div>
        {exportError && <p className="profile-error">{exportError}</p>}

        <div className="danger-zone">
          <p className="setting-label">Delete my account</p>
          <p className="profile-muted setting-hint">
            Permanently deletes your account, workout history, and training plans. This cannot be
            undone.
          </p>

          {deleteStep === "idle" ? (
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => setDeleteStep("confirming")}
            >
              Delete my account
            </button>
          ) : (
            <div className="delete-confirm">
              <p className="profile-muted setting-hint">
                Type <strong>DELETE</strong> to confirm.
              </p>
              <input
                type="text"
                className="setting-select delete-confirm-input"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE"
                autoFocus
              />
              <div className="delete-confirm-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setDeleteStep("idle");
                    setDeleteConfirmText("");
                    setDeleteError(null);
                  }}
                  disabled={deleting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={deleteConfirmText !== "DELETE" || deleting}
                  onClick={handleDeleteAccount}
                >
                  {deleting ? "Deleting..." : "Permanently delete"}
                </button>
              </div>
              {deleteError && <p className="profile-error">{deleteError}</p>}
            </div>
          )}
        </div>
      </section>

      <section className="card profile-section">
        <h2>Legal</h2>
        <Link to="/legal/impressum" className="legal-link">
          <span>Impressum</span>
          <ChevronRightIcon width={18} height={18} />
        </Link>
        <Link to="/legal/privacy" className="legal-link">
          <span>Privacy policy</span>
          <ChevronRightIcon width={18} height={18} />
        </Link>
      </section>

      <style>{`
        .profile-page {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }
        .profile-section h2 {
          font-size: 16px;
          margin-bottom: var(--space-3);
        }
        .profile-name {
          font-size: 17px;
          font-weight: 600;
        }
        .profile-muted {
          color: var(--text-muted);
          font-size: 14px;
        }
        .profile-section .profile-muted + .btn,
        .profile-section .profile-name + .profile-muted + .btn {
          margin-top: var(--space-3);
        }
        .profile-section > .btn {
          margin-top: var(--space-3);
        }
        .profile-info-grid {
          display: grid;
          grid-template-columns: auto 1fr;
          gap: var(--space-2) var(--space-4);
          margin: 0 0 var(--space-3);
        }
        .profile-info-grid dt {
          font-weight: 400;
        }
        .profile-info-grid dd {
          margin: 0;
          text-align: right;
        }
        .profile-hint {
          margin-bottom: var(--space-3);
        }
        .setting-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-3);
          padding: var(--space-3) 0;
          border-top: 1px solid var(--border);
        }
        .profile-section .setting-row:first-of-type {
          border-top: none;
          padding-top: 0;
        }
        .setting-label {
          font-size: 15px;
          font-weight: 500;
        }
        .setting-hint {
          margin-top: 2px;
        }
        .setting-select {
          background: var(--surface-raised);
          border: 1px solid var(--border);
          color: var(--text);
          border-radius: var(--radius-md);
          padding: var(--space-2) var(--space-3);
        }
        .segmented {
          display: inline-flex;
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          overflow: hidden;
        }
        .segmented-option {
          background: var(--surface-raised);
          border: none;
          color: var(--text-muted);
          font-size: 13px;
          font-weight: 600;
          padding: var(--space-2) var(--space-3);
          cursor: pointer;
        }
        .segmented-option-active {
          background: var(--accent);
          color: var(--accent-text);
        }
        .toggle-switch {
          position: relative;
          display: inline-flex;
          cursor: pointer;
        }
        .toggle-switch input {
          position: absolute;
          opacity: 0;
          width: 100%;
          height: 100%;
          margin: 0;
          cursor: pointer;
        }
        .toggle-track {
          width: 44px;
          height: 26px;
          border-radius: 999px;
          background: var(--border);
          display: inline-flex;
          align-items: center;
          padding: 2px;
          transition: background 0.15s ease;
        }
        .toggle-switch input:checked + .toggle-track {
          background: var(--accent);
        }
        .toggle-thumb {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: var(--text);
          transition: transform 0.15s ease;
        }
        .toggle-switch input:checked + .toggle-track .toggle-thumb {
          transform: translateX(18px);
        }
        .save-indicator {
          font-size: 12px;
          margin: calc(var(--space-1) * -1) 0 var(--space-1);
          text-align: right;
        }
        .save-indicator-success {
          color: var(--success);
        }
        .profile-error {
          color: var(--danger);
          font-size: 13px;
          margin-top: var(--space-2);
        }
        .data-privacy-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-3);
        }
        .danger-zone {
          margin-top: var(--space-4);
          padding-top: var(--space-4);
          border-top: 1px solid var(--border);
        }
        .btn-danger {
          background: transparent;
          border: 1px solid var(--danger);
          color: var(--danger);
          margin-top: var(--space-2);
        }
        .delete-confirm {
          margin-top: var(--space-2);
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }
        .delete-confirm-input {
          width: 100%;
        }
        .delete-confirm-actions {
          display: flex;
          gap: var(--space-2);
        }
        .delete-confirm-actions .btn {
          flex: 1;
        }
        .legal-link {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-3) 0;
          border-top: 1px solid var(--border);
          text-decoration: none;
          color: var(--text);
          font-size: 15px;
        }
        .legal-link:first-of-type {
          border-top: none;
          padding-top: 0;
        }
      `}</style>
    </div>
  );
}

function SaveIndicator({ status }: { status?: FieldStatus }) {
  if (!status || status === "idle") return null;
  if (status === "saving") return <p className="save-indicator profile-muted">Saving...</p>;
  if (status === "saved") return <p className="save-indicator save-indicator-success">Saved</p>;
  return <p className="save-indicator profile-error">Couldn't save. Try again.</p>;
}
