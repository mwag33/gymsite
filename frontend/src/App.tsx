import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
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
const LogWorkoutPage = lazy(() => import("./pages/log/LogWorkoutPage"));
const GymPage = lazy(() => import("./pages/gym/GymPage"));
const ProgressPage = lazy(() => import("./pages/progress/ProgressPage"));
const ProfilePage = lazy(() => import("./pages/profile/ProfilePage"));
const ImpressumPage = lazy(() => import("./pages/legal/ImpressumPage"));
const PrivacyPage = lazy(() => import("./pages/legal/PrivacyPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

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
                    <Route path="/log" element={<LogWorkoutPage />} />
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
