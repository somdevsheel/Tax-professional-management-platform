"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError } from "@tax-platform/api-client";
import { apiClient } from "@/lib/api";

function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiClient.auth.resetPassword(token, newPassword);
      setDone(true);
      setTimeout(() => router.replace("/login"), 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "This reset link is invalid or has expired.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <p className="mt-4 text-sm text-red-600">
        This link is missing its reset token. Request a new one from the{" "}
        <Link href="/forgot-password" className="font-medium text-brand-600 hover:text-brand-700">
          forgot password
        </Link>{" "}
        page.
      </p>
    );
  }

  if (done) {
    return <p className="mt-4 text-sm text-slate-600">Your password has been reset. Redirecting to sign in…</p>;
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      <div>
        <label className="label" htmlFor="newPassword">New password</label>
        <input
          id="newPassword"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          className="input"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <p className="mt-1 text-xs text-slate-400">At least 12 characters.</p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" className="btn-primary w-full" disabled={submitting}>
        {submitting ? "Resetting…" : "Reset password"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-sm p-8">
        <h1 className="text-lg font-semibold text-slate-900">Choose a new password</h1>
        <p className="mt-1 text-sm text-slate-500">This link works once and expires 30 minutes after it was sent.</p>
        <Suspense fallback={<p className="mt-4 text-sm text-slate-400">Loading…</p>}>
          <ResetPasswordForm />
        </Suspense>
        <p className="mt-6 text-center text-sm text-slate-500">
          <Link href="/login" className="font-medium text-brand-600 hover:text-brand-700">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
