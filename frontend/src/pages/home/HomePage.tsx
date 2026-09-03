import { useMemo, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useActiveGym } from "../../contexts/ActiveGymContext";
import PlateRing from "../../components/PlateRing";
import TodayHero from "../../features/plan/TodayHero";
import WeekAgenda from "../../features/plan/WeekAgenda";
import MonthAgenda from "../../features/plan/MonthAgenda";
import DayEditSheet from "../../features/plan/DayEditSheet";
import { useDaySessionsRange, dayViewFor } from "../../features/plan/daySessionsRange";
import { addDaysToKey, daysInMonth, startOfMonthKey, startOfWeekKey, toLocalDateKey } from "../../features/plan/planDate";

type CalendarView = "week" | "month";

export default function HomePage() {
  const { user, profile } = useAuth();
  const { activeGym } = useActiveGym();
  const [view, setView] = useState<CalendarView>("week");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const today = useMemo(() => toLocalDateKey(new Date()), []);
  const weekStartsOn = profile?.settings?.weekStartsOn ?? 1;
  const pattern = profile?.weeklyFocusPattern ?? null;

  const weekStart = useMemo(() => startOfWeekKey(today, weekStartsOn), [today, weekStartsOn]);
  const monthStart = useMemo(() => startOfMonthKey(today), [today]);

  // One subscription generously covers both views (a week or so of padding
  // either side of the visible month) so toggling week/month never re-queries.
  const rangeStart = useMemo(() => addDaysToKey(monthStart, -7), [monthStart]);
  const rangeEnd = useMemo(
    () => addDaysToKey(monthStart, daysInMonth(monthStart) + 6),
    [monthStart]
  );
  const byDate = useDaySessionsRange(user?.uid, rangeStart, rangeEnd);

  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysToKey(weekStart, i)), [weekStart]);
  const weekTarget = profile?.daysPerWeek ?? null;
  const completedThisWeek = weekDates.filter((d) => {
    const v = dayViewFor(d, byDate[d], pattern);
    return v.status !== "empty" && v.focus !== "rest";
  }).length;

  const todayView = dayViewFor(today, byDate[today], pattern);

  return (
    <div className="home-page">
      <div className="home-adherence">
        <PlateRing
          size={56}
          fillPercent={weekTarget ? completedThisWeek / weekTarget : 0}
          label={weekTarget ? `${completedThisWeek}/${weekTarget}` : completedThisWeek}
        />
        <div>
          <p className="home-adherence-eyebrow">This week</p>
          <p className="home-adherence-headline">
            {weekTarget
              ? `${completedThisWeek} of ${weekTarget} sessions`
              : `${completedThisWeek} session${completedThisWeek === 1 ? "" : "s"} logged`}
          </p>
        </div>
      </div>

      <TodayHero date={today} view={todayView} session={byDate[today]} />

      <div className="home-calendar-toggle" role="group" aria-label="Calendar view">
        <button
          type="button"
          className={"home-calendar-toggle-btn" + (view === "week" ? " home-calendar-toggle-btn-active" : "")}
          onClick={() => setView("week")}
        >
          Week
        </button>
        <button
          type="button"
          className={"home-calendar-toggle-btn" + (view === "month" ? " home-calendar-toggle-btn-active" : "")}
          onClick={() => setView("month")}
        >
          Month
        </button>
      </div>

      {view === "week" ? (
        <WeekAgenda
          byDate={byDate}
          pattern={pattern}
          today={today}
          weekStart={weekStart}
          onSelectDate={setSelectedDate}
        />
      ) : (
        <MonthAgenda
          byDate={byDate}
          pattern={pattern}
          today={today}
          monthAnchor={today}
          weekStartsOn={weekStartsOn}
          onSelectDate={setSelectedDate}
        />
      )}

      {user && selectedDate && (
        <DayEditSheet
          open={Boolean(selectedDate)}
          onClose={() => setSelectedDate(null)}
          uid={user.uid}
          date={selectedDate}
          effectiveFocus={dayViewFor(selectedDate, byDate[selectedDate], pattern).focus}
          session={byDate[selectedDate]}
          gymId={activeGym?.id ?? null}
        />
      )}

      <style>{`
        .home-page {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }
        .home-adherence {
          display: flex;
          align-items: center;
          gap: var(--space-3);
        }
        .home-adherence-eyebrow {
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--text-muted);
        }
        .home-adherence-headline {
          font-size: 16px;
          font-weight: 600;
        }
        .home-calendar-toggle {
          display: flex;
          align-self: center;
          gap: 4px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 999px;
          padding: 3px;
        }
        .home-calendar-toggle-btn {
          background: transparent;
          border: none;
          border-radius: 999px;
          padding: var(--space-1) var(--space-4);
          font-size: 13px;
          font-weight: 600;
          color: var(--text-muted);
          cursor: pointer;
        }
        .home-calendar-toggle-btn-active {
          background: var(--accent);
          color: var(--accent-text);
        }
      `}</style>
    </div>
  );
}
