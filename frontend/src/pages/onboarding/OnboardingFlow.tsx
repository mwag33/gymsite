import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useActiveGym } from "../../contexts/ActiveGymContext";
import {
  generateExercisesForWeek,
  generateSchedule,
  updateSession,
  updateUserSettings,
  type GenerateExercisesForWeekInput,
  type GenerateScheduleInput,
} from "../../lib/callables";
import PlanReveal from "../../features/plan/PlanReveal";
import { EDITABLE_FOCUS_OPTIONS, FOCUS_LABELS } from "../../features/plan/planFocus";
import { weekdayLabel } from "../../features/plan/planDate";
import { GOAL_OPTIONS, type ExperienceLevel, type Goal, type PlanDoc, type TrainingPlanFocus } from "../../lib/types";

// Onboarding's schedule-review step only reviews/edits the first 7 days of
// the new ~28-day schedule chip-by-chip; the remaining ~21 days are accepted
// as-generated (see plan doc "Onboarding adaptation").
const REVIEWABLE_DAYS = 7;

type StepKey =
  | "goal"
  | "experience"
  | "days"
  | "session"
  | "gym"
  | "equipment"
  | "injuries"
  | "reminders";

type Phase =
  | "questions"
  | "generating-schedule"
  | "schedule-review"
  | "generating-exercises"
  | "exercise-review"
  | "error";

const AUTO_ADVANCE_MS = 700;

const GOAL_MICROCOPY: Record<Goal, string> = {
  allround_strength: "Great. We'll build a balanced full-body week.",
  upper_body: "Got it. More chest, back, shoulders and arms in your plan.",
  lower_body: "Noted. Legs and glutes will lead the week.",
  cardio: "Got it. We'll bias your week toward conditioning work.",
  custom: "Noted. We'll keep it flexible and adjust as we learn more.",
};

const EXPERIENCE_OPTIONS: { value: ExperienceLevel; label: string; description: string }[] = [
  { value: "new", label: "New to training", description: "First time in a structured program" },
  { value: "some_experience", label: "Some experience", description: "Trained on and off before" },
  { value: "experienced", label: "Experienced", description: "Consistent training for years" },
];

const EXPERIENCE_MICROCOPY: Record<ExperienceLevel, string> = {
  new: "We'll keep the ramp gentle and focus on form.",
  some_experience: "We'll build on what you already know.",
  experienced: "We'll push intensity and volume accordingly.",
};

const DAYS_OPTIONS = [2, 3, 4, 5, 6];
const SESSION_OPTIONS = [30, 45, 60, 90];

export default function OnboardingFlow() {
  const { activeGym } = useActiveGym();
  const navigate = useNavigate();

  const steps = useMemo<StepKey[]>(() => {
    const base: StepKey[] = ["goal", "experience", "days", "session", "gym"];
    if (!activeGym) base.push("equipment");
    base.push("injuries", "reminders");
    return base;
  }, [activeGym]);

  const [stepIndex, setStepIndex] = useState(0);
  const [microcopy, setMicrocopy] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("questions");
  const [plan, setPlan] = useState<PlanDoc | null>(null);
  // Local edits to the first week's focus chips, keyed by session id —
  // persisted via updateSession right before exercise generation so the
  // server-side fill reads the edited focuses, not the originally generated ones.
  const [editedFocuses, setEditedFocuses] = useState<Record<string, TrainingPlanFocus>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<"schedule" | "exercises">("schedule");

  const [goal, setGoal] = useState<Goal | null>(null);
  const [experience, setExperience] = useState<ExperienceLevel | null>(null);
  const [daysPerWeek, setDaysPerWeek] = useState<number | null>(null);
  const [sessionLengthMinutes, setSessionLengthMinutes] = useState<number | null>(null);
  const [equipmentNotes, setEquipmentNotes] = useState("");
  const [injuryNotes, setInjuryNotes] = useState("");
  const [wantsReminders, setWantsReminders] = useState<boolean | null>(null);

  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  function scheduleAdvance(delayMs = AUTO_ADVANCE_MS) {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      setMicrocopy(null);
      setStepIndex((i) => i + 1);
    }, delayMs);
  }

  function buildPreferences(reminders: boolean | null): string | undefined {
    const parts: string[] = [];
    if (reminders) parts.push("wants rest day reminders");
    return parts.join("; ") || undefined;
  }

  async function submitSchedule(reminders: boolean | null) {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    setLastAction("schedule");
    setPhase("generating-schedule");
    setErrorMessage(null);
    try {
      // The plan doc's `timezone` is copied from UserSettings at generation
      // time, so this must complete before generateSchedule runs — only the
      // client can supply the real IANA zone.
      await updateUserSettings({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
      const input: GenerateScheduleInput = {
        goal: goal as Goal,
        experience: experience as ExperienceLevel,
        daysPerWeek: daysPerWeek as number,
        sessionLengthMinutes: sessionLengthMinutes as number,
        gymId: activeGym?.id ?? null,
        equipmentNotes: equipmentNotes.trim() || undefined,
        injuryNotes: injuryNotes.trim() || undefined,
        preferences: buildPreferences(reminders),
      };
      const result = await generateSchedule(input);
      setPlan(result);
      setEditedFocuses({});
      setPhase("schedule-review");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong generating your plan.");
      setPhase("error");
    }
  }

  function updateDayFocus(sessionId: string, focus: TrainingPlanFocus) {
    setEditedFocuses((prev) => ({ ...prev, [sessionId]: focus }));
    setPlan((prev) =>
      prev
        ? { ...prev, sessions: prev.sessions.map((s) => (s.id === sessionId ? { ...s, focus } : s)) }
        : prev
    );
  }

  async function submitExercises() {
    if (!plan) return;
    setLastAction("exercises");
    setPhase("generating-exercises");
    setErrorMessage(null);
    try {
      // Persist any schedule-review focus edits first — generateExercisesForWeek
      // reads the plan doc itself, so the server only sees edits already saved.
      const editedIds = Object.keys(editedFocuses);
      if (editedIds.length > 0) {
        await Promise.all(
          editedIds.map((sessionId) =>
            updateSession({ sessionId, patch: { focus: editedFocuses[sessionId] } })
          )
        );
      }
      const input: GenerateExercisesForWeekInput = {
        experience: experience as ExperienceLevel,
        sessionLengthMinutes: sessionLengthMinutes as number,
        gymId: activeGym?.id ?? null,
        equipmentNotes: equipmentNotes.trim() || undefined,
        injuryNotes: injuryNotes.trim() || undefined,
        preferences: buildPreferences(wantsReminders),
      };
      const result = await generateExercisesForWeek(input);
      setPlan(result);
      setPhase("exercise-review");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Something went wrong suggesting exercises."
      );
      setPhase("error");
    }
  }

  function selectGoal(value: Goal) {
    setGoal(value);
    setMicrocopy(GOAL_MICROCOPY[value]);
    scheduleAdvance();
  }

  function selectExperience(value: ExperienceLevel) {
    setExperience(value);
    setMicrocopy(EXPERIENCE_MICROCOPY[value]);
    scheduleAdvance();
  }

  function selectDays(value: number) {
    setDaysPerWeek(value);
    setMicrocopy(`${value} days a week, locked in.`);
    scheduleAdvance();
  }

  function selectSession(value: number) {
    setSessionLengthMinutes(value);
    setMicrocopy(`${value}-minute sessions, got it.`);
    scheduleAdvance();
  }

  function confirmGym() {
    setMicrocopy(
      activeGym
        ? `Training at ${activeGym.name}. We'll use what's there.`
        : "No problem. Add a gym anytime from the Gym tab."
    );
    scheduleAdvance();
  }

  function continueEquipment() {
    setMicrocopy(
      equipmentNotes.trim()
        ? "Noted. We'll work around what you have."
        : "No problem, we'll assume standard gym equipment."
    );
    scheduleAdvance(equipmentNotes.trim() ? AUTO_ADVANCE_MS : 200);
  }

  function continueInjuries() {
    setMicrocopy(injuryNotes.trim() ? "Thanks. We'll train around that." : "Got it, no restrictions noted.");
    scheduleAdvance(injuryNotes.trim() ? AUTO_ADVANCE_MS : 200);
  }

  function selectReminders(value: boolean) {
    setWantsReminders(value);
    setMicrocopy(value ? "We'll nudge you on rest days." : "Got it. No rest-day nudges.");
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      void submitSchedule(value);
    }, AUTO_ADVANCE_MS);
  }

  if (phase === "generating-schedule") {
    return <GeneratingScreen title="Drafting your weekly split..." />;
  }

  if (phase === "generating-exercises") {
    return <GeneratingScreen title="Picking exercises for your week..." />;
  }

  if (phase === "error") {
    return (
      <div className="onboarding-screen">
        <div className="onboarding-question">
          <h1>We hit a snag</h1>
          <p className="onboarding-error">{errorMessage}</p>
          <button
            type="button"
            className="btn btn-primary onboarding-wide-btn"
            onClick={() => void (lastAction === "schedule" ? submitSchedule(wantsReminders) : submitExercises())}
          >
            Try again
          </button>
        </div>
        <OnboardingStyles />
      </div>
    );
  }

  if (phase === "schedule-review" && plan) {
    const sortedSessions = [...plan.sessions].sort((a, b) => a.date.localeCompare(b.date));
    const reviewableSessions = sortedSessions.slice(0, REVIEWABLE_DAYS);
    return (
      <div className="onboarding-screen">
        <h1 className="onboarding-reveal-title">Your weekly split</h1>
        <p className="onboarding-hint">
          Tap a day to change its focus, or mark it a rest day. When it looks right, we'll
          suggest specific exercises for each training day. The rest of your first month is
          already scheduled — you can fine-tune it later from Home.
        </p>
        <div className="onboarding-schedule-days">
          {reviewableSessions.map((session) => (
            <div key={session.id} className="card onboarding-schedule-day">
              <span className="onboarding-schedule-day-name">{weekdayLabel(session.date)}</span>
              <div className="onboarding-schedule-chip-row">
                {EDITABLE_FOCUS_OPTIONS.map((focus) => (
                  <button
                    key={focus}
                    type="button"
                    className={
                      "onboarding-schedule-chip" +
                      (session.focus === focus ? " onboarding-schedule-chip-selected" : "")
                    }
                    onClick={() => updateDayFocus(session.id, focus)}
                  >
                    {FOCUS_LABELS[focus]}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-primary onboarding-wide-btn"
          onClick={() => void submitExercises()}
        >
          Suggest exercises
        </button>
        <OnboardingStyles />
      </div>
    );
  }

  if (phase === "exercise-review" && plan) {
    const firstWeekSessions = [...plan.sessions]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, REVIEWABLE_DAYS);
    return (
      <div className="onboarding-screen">
        <h1 className="onboarding-reveal-title">Your first week</h1>
        <PlanReveal
          sessions={firstWeekSessions}
          onAccept={() => navigate("/", { replace: true })}
          onSessionsChange={(updated) =>
            setPlan((prev) => {
              if (!prev) return prev;
              const byId = new Map(updated.map((s) => [s.id, s]));
              return { ...prev, sessions: prev.sessions.map((s) => byId.get(s.id) ?? s) };
            })
          }
        />
        <OnboardingStyles />
      </div>
    );
  }

  const currentStep = steps[stepIndex];
  const progress = ((stepIndex + 1) / steps.length) * 100;

  return (
    <div className="onboarding-screen">
      <div className="onboarding-progress-track" aria-hidden>
        <div className="onboarding-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      <div className="onboarding-question">
        {currentStep === "goal" && (
          <>
            <h1>What's your main goal?</h1>
            <div className="onboarding-cards">
              {GOAL_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={"onboarding-card" + (goal === opt.value ? " onboarding-card-selected" : "")}
                  onClick={() => selectGoal(opt.value)}
                >
                  <span className="onboarding-card-title">{opt.label}</span>
                  <span className="onboarding-card-desc">{opt.description}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {currentStep === "experience" && (
          <>
            <h1>How experienced are you?</h1>
            <div className="onboarding-cards">
              {EXPERIENCE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={
                    "onboarding-card" + (experience === opt.value ? " onboarding-card-selected" : "")
                  }
                  onClick={() => selectExperience(opt.value)}
                >
                  <span className="onboarding-card-title">{opt.label}</span>
                  <span className="onboarding-card-desc">{opt.description}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {currentStep === "days" && (
          <>
            <h1>How many days a week?</h1>
            <div className="onboarding-chips">
              {DAYS_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={"onboarding-chip" + (daysPerWeek === n ? " onboarding-chip-selected" : "")}
                  onClick={() => selectDays(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </>
        )}

        {currentStep === "session" && (
          <>
            <h1>How long per session?</h1>
            <div className="onboarding-chips">
              {SESSION_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={
                    "onboarding-chip" + (sessionLengthMinutes === n ? " onboarding-chip-selected" : "")
                  }
                  onClick={() => selectSession(n)}
                >
                  {n} min
                </button>
              ))}
            </div>
          </>
        )}

        {currentStep === "gym" && (
          <>
            <h1>Where do you train?</h1>
            {activeGym ? (
              <div className="onboarding-card onboarding-card-static onboarding-card-selected">
                <span className="onboarding-card-title">{activeGym.name}</span>
                <span className="onboarding-card-desc">We'll tailor your plan to what's there.</span>
              </div>
            ) : (
              <p className="onboarding-hint">
                You haven't set up a gym yet. You can add one anytime from the Gym tab.
              </p>
            )}
            <button type="button" className="btn btn-primary onboarding-wide-btn" onClick={confirmGym}>
              {activeGym ? "Continue" : "I'll set up my gym later"}
            </button>
          </>
        )}

        {currentStep === "equipment" && (
          <>
            <h1>Any equipment limits?</h1>
            <p className="onboarding-hint">Optional. Tell us what you don't have access to.</p>
            <textarea
              className="onboarding-textarea"
              value={equipmentNotes}
              onChange={(e) => setEquipmentNotes(e.target.value)}
              placeholder="e.g. no barbells, only dumbbells up to 20kg"
              rows={4}
            />
            <div className="onboarding-btn-row">
              <button type="button" className="btn btn-secondary" onClick={continueEquipment}>
                Skip
              </button>
              <button type="button" className="btn btn-primary" onClick={continueEquipment}>
                Continue
              </button>
            </div>
          </>
        )}

        {currentStep === "injuries" && (
          <>
            <h1>Anything we should train around?</h1>
            <p className="onboarding-hint">Optional. Injuries or limitations.</p>
            <textarea
              className="onboarding-textarea"
              value={injuryNotes}
              onChange={(e) => setInjuryNotes(e.target.value)}
              placeholder="e.g. sensitive lower back, avoid heavy overhead pressing"
              rows={4}
            />
            <div className="onboarding-btn-row">
              <button type="button" className="btn btn-secondary" onClick={continueInjuries}>
                Skip
              </button>
              <button type="button" className="btn btn-primary" onClick={continueInjuries}>
                Continue
              </button>
            </div>
          </>
        )}

        {currentStep === "reminders" && (
          <>
            <h1>Want rest-day reminders?</h1>
            <div className="onboarding-cards">
              <button
                type="button"
                className={
                  "onboarding-card" + (wantsReminders === true ? " onboarding-card-selected" : "")
                }
                onClick={() => selectReminders(true)}
              >
                <span className="onboarding-card-title">Yes, nudge me</span>
              </button>
              <button
                type="button"
                className={
                  "onboarding-card" + (wantsReminders === false ? " onboarding-card-selected" : "")
                }
                onClick={() => selectReminders(false)}
              >
                <span className="onboarding-card-title">No thanks</span>
              </button>
            </div>
          </>
        )}

        {microcopy && <p className="onboarding-microcopy">{microcopy}</p>}
      </div>

      <OnboardingStyles />
    </div>
  );
}

function GeneratingScreen({ title }: { title: string }) {
  return (
    <div className="onboarding-screen">
      <div className="onboarding-generating">
        <h1>{title}</h1>
        <div className="onboarding-skeleton-list">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card onboarding-skeleton-day" style={{ animationDelay: `${i * 0.08}s` }}>
              <div className="onboarding-skeleton-line onboarding-skeleton-line-short" />
              <div className="onboarding-skeleton-line" />
            </div>
          ))}
        </div>
      </div>
      <OnboardingStyles />
    </div>
  );
}

function OnboardingStyles() {
  return (
    <style>{`
      .onboarding-screen {
        min-height: 100dvh;
        display: flex;
        flex-direction: column;
        gap: var(--space-5);
        padding: var(--space-5) var(--space-4);
        max-width: 480px;
        margin: 0 auto;
      }
      .onboarding-progress-track {
        height: 4px;
        border-radius: 999px;
        background: var(--border);
        overflow: hidden;
      }
      .onboarding-progress-fill {
        height: 100%;
        background: var(--accent);
        border-radius: 999px;
        transition: width 0.3s ease;
      }
      .onboarding-question {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
        justify-content: center;
      }
      .onboarding-question h1 {
        font-size: 24px;
      }
      .onboarding-hint {
        margin: 0;
        color: var(--text-muted);
        font-size: 14px;
      }
      .onboarding-cards {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      .onboarding-card {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
        text-align: left;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        padding: var(--space-4);
        cursor: pointer;
        color: var(--text);
        transition: border-color 0.15s ease, background 0.15s ease, transform 0.1s ease;
      }
      .onboarding-card:active {
        transform: scale(0.98);
      }
      .onboarding-card-static {
        cursor: default;
      }
      .onboarding-card-selected {
        border-color: var(--accent);
        background: var(--surface-raised);
      }
      .onboarding-card-title {
        font-weight: 600;
        font-size: 16px;
      }
      .onboarding-card-desc {
        font-size: 13px;
        color: var(--text-muted);
      }
      .onboarding-chips {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-3);
      }
      .onboarding-chip {
        flex: 1 1 30%;
        min-width: 80px;
        text-align: center;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        padding: var(--space-4) var(--space-3);
        font-size: 17px;
        font-weight: 600;
        color: var(--text);
        cursor: pointer;
        transition: border-color 0.15s ease, background 0.15s ease, transform 0.1s ease;
      }
      .onboarding-chip:active {
        transform: scale(0.98);
      }
      .onboarding-chip-selected {
        border-color: var(--accent);
        background: var(--surface-raised);
        color: var(--accent);
      }
      .onboarding-textarea {
        width: 100%;
        background: var(--surface-raised);
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        padding: var(--space-3);
        color: var(--text);
        resize: vertical;
      }
      .onboarding-btn-row {
        display: flex;
        gap: var(--space-3);
      }
      .onboarding-btn-row .btn {
        flex: 1;
      }
      .onboarding-wide-btn {
        width: 100%;
      }
      .onboarding-microcopy {
        margin: 0;
        font-size: 14px;
        color: var(--accent);
        font-weight: 500;
        animation: onboarding-fade-in 0.2s ease;
      }
      .onboarding-error {
        color: var(--danger);
        font-size: 14px;
      }
      .onboarding-reveal-title {
        font-size: 22px;
      }
      .onboarding-schedule-days {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      .onboarding-schedule-day {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }
      .onboarding-schedule-day-name {
        font-weight: 600;
        font-size: 14px;
      }
      .onboarding-schedule-chip-row {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
      }
      .onboarding-schedule-chip {
        font-size: 12px;
        padding: 6px 10px;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: var(--surface-raised);
        color: var(--text-muted);
        cursor: pointer;
      }
      .onboarding-schedule-chip-selected {
        border-color: var(--accent);
        color: var(--accent);
      }
      .onboarding-generating {
        display: flex;
        flex-direction: column;
        gap: var(--space-5);
        flex: 1;
        justify-content: center;
      }
      .onboarding-generating h1 {
        font-size: 20px;
        color: var(--text-muted);
        text-align: center;
      }
      .onboarding-skeleton-list {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      .onboarding-skeleton-day {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        animation: onboarding-pulse 1.2s ease-in-out infinite;
      }
      .onboarding-skeleton-line {
        height: 10px;
        border-radius: 4px;
        background: var(--surface-raised);
      }
      .onboarding-skeleton-line-short {
        width: 40%;
      }
      @keyframes onboarding-pulse {
        0%, 100% { opacity: 0.5; }
        50% { opacity: 1; }
      }
      @keyframes onboarding-fade-in {
        from { opacity: 0; transform: translateY(4px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `}</style>
  );
}
