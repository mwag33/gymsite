import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "./AuthContext";
import { updateUserSettings } from "../lib/callables";
import type { Gym } from "../lib/types";

interface ActiveGymContextValue {
  activeGym: (Gym & { id: string }) | null;
  loading: boolean;
  setActiveGymId: (gymId: string) => Promise<void>;
}

const ActiveGymContext = createContext<ActiveGymContextValue | null>(null);

export function ActiveGymProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const activeGymId = profile?.settings?.activeGymId ?? null;
  const [activeGym, setActiveGym] = useState<(Gym & { id: string }) | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeGymId) {
      setActiveGym(null);
      return;
    }
    setLoading(true);
    return onSnapshot(doc(db, "gyms", activeGymId), (snap) => {
      setActiveGym(snap.exists() ? ({ id: snap.id, ...snap.data() } as Gym & { id: string }) : null);
      setLoading(false);
    });
  }, [activeGymId]);

  const value: ActiveGymContextValue = {
    activeGym,
    loading,
    async setActiveGymId(gymId: string) {
      await updateUserSettings({ activeGymId: gymId });
    },
  };

  return (
    <ActiveGymContext.Provider value={value}>{children}</ActiveGymContext.Provider>
  );
}

export function useActiveGym(): ActiveGymContextValue {
  const ctx = useContext(ActiveGymContext);
  if (!ctx) throw new Error("useActiveGym must be used within ActiveGymProvider");
  return ctx;
}
