import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { LoadingScreen } from "./LoadingScreen";

// Wraps the main app routes (AppShell tabs). Sends a signed-in user with no
// goal set yet into the onboarding wizard before they can reach the tabs.
export function OnboardingGate() {
  const { profile, profileLoading } = useAuth();

  if (profileLoading) return <LoadingScreen label="Setting up your account..." />;
  if (profile && !profile.goal) {
    return <Navigate to="/onboarding" replace />;
  }
  return <Outlet />;
}
