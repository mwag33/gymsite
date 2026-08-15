import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db, googleProvider } from "../lib/firebase";
import type { UserProfile } from "../lib/types";

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  profileLoading: boolean;
  redirectError: string | null;
  signInWithGoogle: () => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [redirectError, setRedirectError] = useState<string | null>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
      if (!nextUser) {
        setProfile(null);
        setProfileLoading(false);
      }
    });
  }, []);

  // Completes the signInWithRedirect round-trip after Google bounces the
  // user back here. Google sign-in deliberately uses redirect rather than
  // signInWithPopup — the popup flow's IndexedDB-backed persistence layer
  // races with the popup window closing on Safari and privacy-hardened
  // browsers, surfacing as an opaque "database is closing" error. Redirect
  // avoids that race entirely and is also the friendlier flow on mobile web.
  useEffect(() => {
    getRedirectResult(auth).catch((err) => {
      setRedirectError(
        err instanceof Error ? err.message : "Google sign-in failed. Please try again."
      );
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    setProfileLoading(true);
    // The user's profile doc is created server-side by the onUserCreate Cloud
    // Function on first sign-in, so it may not exist for a brief moment —
    // onSnapshot picks it up as soon as it lands instead of a one-shot get().
    return onSnapshot(doc(db, "users", user.uid), (snap) => {
      setProfile(snap.exists() ? (snap.data() as UserProfile) : null);
      setProfileLoading(false);
    });
  }, [user]);

  const value: AuthContextValue = {
    user,
    profile,
    loading,
    profileLoading,
    redirectError,
    async signInWithGoogle() {
      await signInWithRedirect(auth, googleProvider);
    },
    async signUpWithEmail(email, password) {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await sendEmailVerification(cred.user);
    },
    async signInWithEmail(email, password) {
      await signInWithEmailAndPassword(auth, email, password);
    },
    async signOut() {
      await firebaseSignOut(auth);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
