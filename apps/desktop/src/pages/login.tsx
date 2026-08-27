import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "@tax-platform/api-client";
import { useAuth } from "../lib/auth-context";
import { apiClient } from "../lib/api";

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [resetSubmitting, setResetSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onRequestReset(e: FormEvent) {
    e.preventDefault();
    setResetSubmitting(true);
    try {
      // The reset link in the email always points at the web app (that's where
      // /reset-password lives) — a real user's OS will open it in their browser regardless of
      // which client (desktop or web) requested it, so this is the same one backend call
      // either way.
      await apiClient.auth.forgotPassword(resetEmail);
      setResetSent(true);
    } finally {
      setResetSubmitting(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="card login-card">
        {showForgotPassword ? (
          <>
            <h2 style={{ marginTop: 0, fontSize: 16 }}>Reset your password</h2>
            {resetSent ? (
              <p className="muted" style={{ marginBottom: 16 }}>
                If an account exists for {resetEmail}, a reset link has been sent — open it from your email on any
                device to finish resetting your password.
              </p>
            ) : (
              <form onSubmit={onRequestReset}>
                <p className="muted" style={{ marginBottom: 16 }}>
                  Enter your account email and we&apos;ll send you a reset link.
                </p>
                <input
                  className="input"
                  type="email"
                  placeholder="Email"
                  required
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                />
                <button className="btn btn-primary" style={{ width: "100%" }} disabled={resetSubmitting}>
                  {resetSubmitting ? "Sending…" : "Send reset link"}
                </button>
              </form>
            )}
            <p className="muted" style={{ textAlign: "center", marginTop: 16 }}>
              <a href="#" onClick={(e) => { e.preventDefault(); setShowForgotPassword(false); setResetSent(false); }}>
                Back to sign in
              </a>
            </p>
          </>
        ) : (
          <>
            <h2 style={{ marginTop: 0, fontSize: 16 }}>Sign in</h2>
            <p className="muted" style={{ marginBottom: 16 }}>Tax Practice Platform — Desktop</p>
            <form onSubmit={onSubmit}>
              <input
                className="input"
                type="email"
                placeholder="Email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <input
                className="input"
                type="password"
                placeholder="Password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {error && <p className="error-text">{error}</p>}
              <button type="submit" className="btn btn-primary" style={{ width: "100%" }} disabled={submitting}>
                {submitting ? "Signing in…" : "Sign in"}
              </button>
            </form>
            <p className="muted" style={{ textAlign: "center", marginTop: 16 }}>
              <a href="#" onClick={(e) => { e.preventDefault(); setShowForgotPassword(true); }}>
                Forgot password?
              </a>
            </p>
            <p className="muted" style={{ textAlign: "center", marginTop: 8 }}>
              Setting up a new firm? <Link to="/register">Create one</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
