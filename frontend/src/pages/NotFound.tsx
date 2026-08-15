import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="not-found-page">
      <svg
        width="72"
        height="72"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--text-muted)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M6 7v10M18 7v10M2 10v4M22 10v4M6 12h4" />
        <path d="M15 9.5 18.5 13" stroke="var(--accent)" strokeDasharray="1 3" />
      </svg>

      <h1>Page not found</h1>
      <p className="not-found-copy">
        This page doesn't exist, or it may have moved. Let's get you back to your training.
      </p>
      <Link to="/" className="btn btn-primary">
        Back to Home
      </Link>

      <style>{`
        .not-found-page {
          min-height: 100dvh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: var(--space-4);
          padding: var(--space-5);
          text-align: center;
          background: var(--bg);
          color: var(--text);
        }
        .not-found-page h1 {
          font-size: 20px;
        }
        .not-found-copy {
          color: var(--text-muted);
          max-width: 320px;
        }
      `}</style>
    </div>
  );
}
