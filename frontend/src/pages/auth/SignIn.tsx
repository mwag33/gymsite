import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

export default function SignIn() {
  const { user, redirectError, signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: Location })?.from?.pathname || "/";

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Google sign-in uses signInWithRedirect (see AuthContext), so the page
  // fully navigates away and back rather than resolving a promise here —
  // once the redirect completes, `user` becomes truthy on the next render
  // and this sends them on, whether that's the first return-from-Google
  // render or just a signed-in user landing on /signin directly.
  useEffect(() => {
    if (user) navigate(from, { replace: true });
  }, [user, from, navigate]);

  async function handleGoogle() {
    setError(null);
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
      setBusy(false);
    }
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        await signUpWithEmail(email, password);
      } else {
        await signInWithEmail(email, password);
      }
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="signin-page">
      <div className="signin-hero" />
      <div className="card" style={{ width: "100%", maxWidth: 380 }}>
        <h1 style={{ fontSize: 22, marginBottom: "var(--space-1)" }}>
          {mode === "signup" ? "Create your account" : "Welcome back"}
        </h1>
        <p style={{ color: "var(--text-muted)", marginBottom: "var(--space-5)" }}>
          Train smarter with an AI-adjusted weekly plan.
        </p>

        <button
          type="button"
          className="btn btn-secondary"
          style={{ width: "100%", marginBottom: "var(--space-4)" }}
          onClick={handleGoogle}
          disabled={busy}
        >
          Continue with Google
        </button>
        {redirectError && (
          <p style={{ color: "var(--danger)", fontSize: 13, marginTop: -8, marginBottom: "var(--space-4)" }}>
            {redirectError}
          </p>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-3)",
            color: "var(--text-muted)",
            fontSize: 13,
            marginBottom: "var(--space-4)",
          }}
        >
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          or
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
        </div>

        <form onSubmit={handleEmailSubmit}>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            <input
              type="email"
              placeholder="Email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
            />
            <input
              type="password"
              placeholder="Password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
            />
            {error && (
              <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>
            )}
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {mode === "signup" ? "Sign up" : "Sign in"}
            </button>
          </div>
        </form>

        <button
          type="button"
          onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
          style={{
            marginTop: "var(--space-4)",
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            fontSize: 13,
            cursor: "pointer",
            width: "100%",
          }}
        >
          {mode === "signup"
            ? "Already have an account? Sign in"
            : "New here? Create an account"}
        </button>
      </div>

      <style>{`
        .signin-page {
          min-height: 100dvh;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: var(--space-5);
          gap: var(--space-5);
        }
        .signin-hero {
          width: 100%;
          max-width: 380px;
          height: 30vh;
          min-height: 160px;
          max-height: 260px;
          margin-top: calc(var(--space-5) * -1);
          background-image:
            linear-gradient(to top, var(--bg) 0%, rgba(18, 18, 20, 0.05) 55%, rgba(255, 90, 54, 0.18) 100%),
            url("/hero.webp");
          background-size: cover;
          background-position: center;
          border-radius: 0 0 var(--radius-lg) var(--radius-lg);
          flex-shrink: 0;
        }
        @media (min-width: 400px) {
          .signin-hero {
            border-radius: var(--radius-lg);
            margin-top: 0;
          }
        }
      `}</style>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "var(--space-3)",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border)",
  background: "var(--surface-raised)",
  color: "var(--text)",
};
