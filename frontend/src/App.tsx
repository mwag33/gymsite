import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ActiveGymProvider } from "./contexts/ActiveGymContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { OnboardingGate } from "./components/OnboardingGate";
import { AppShell } from "./components/AppShell";
import { LoadingScreen } from "./components/LoadingScreen";

import SignIn from "./pages/auth/SignIn";

// Route-level code splitting: each tab (and recharts-heavy Progress in
// particular) only downloads once the user actually navigates there, instead
// of all shipping in the initial bundle for a mobile-first app.
const OnboardingFlow = lazy(() => import("./pages/onboarding/OnboardingFlow"));
const HomePage = lazy(() => import("./pages/home/HomePage"));
const DayLogPage = lazy(() => import("./pages/session/DayLogPage"));
const GymPage = lazy(() => import("./pages/gym/GymPage"));
const ProgressPage = lazy(() => import("./pages/progress/ProgressPage"));
const ProfilePage = lazy(() => import("./pages/profile/ProfilePage"));
const ImpressumPage = lazy(() => import("./pages/legal/ImpressumPage"));
const PrivacyPage = lazy(() => import("./pages/legal/PrivacyPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

// The old /log/:date resolver used to disambiguate which tracked session to
// open; there's exactly one daySessions doc per date now, so this just
// forwards the date straight through to the merged day-log page.
function RedirectToDay() {
  const { date } = useParams<{ date: string }>();
  return <Navigate to={`/day/${date}`} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ActiveGymProvider>
          <Suspense fallback={<LoadingScreen />}>
            <Routes>
              <Route path="/signin" element={<SignIn />} />
              <Route path="/legal/impressum" element={<ImpressumPage />} />
              <Route path="/legal/privacy" element={<PrivacyPage />} />

              <Route element={<ProtectedRoute />}>
                <Route path="/onboarding" element={<OnboardingFlow />} />

                <Route element={<OnboardingGate />}>
                  <Route element={<AppShell />}>
                    <Route index element={<HomePage />} />
                    <Route path="/day/:date" element={<DayLogPage />} />
                    {/* MonthAgenda is now inline on Home (the IA collapse) - redirect
                        rather than 404 for any bookmarked/history /calendar URL. */}
                    <Route path="/calendar" element={<Navigate to="/" replace />} />
                    {/* /log and /log/:date used to resolve which tracked session to
                        open; there's exactly one session per day now, so /day/:date
                        (today by default) replaces them directly. */}
                    <Route path="/log" element={<Navigate to="/" replace />} />
                    <Route path="/log/:date" element={<RedirectToDay />} />
                    <Route path="/progress" element={<ProgressPage />} />
                    <Route path="/gym" element={<GymPage />} />
                    <Route path="/profile" element={<ProfilePage />} />
                  </Route>
                </Route>
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </ActiveGymProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
