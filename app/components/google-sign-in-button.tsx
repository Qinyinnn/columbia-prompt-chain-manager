"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function GoogleSignInButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function signIn() {
    setLoading(true);
    setError("");

    try {
      const supabase = createClient();
      // Build the callback from the origin currently running this app. This
      // avoids falling back to the shared Supabase project's Site URL.
      const redirectTo = new URL("/auth/callback", window.location.origin).toString();
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: { prompt: "select_account" },
        },
      });

      if (signInError) throw signInError;
    } catch {
      setError("Google sign-in could not be started. Check the Supabase Google provider settings and try again.");
      setLoading(false);
    }
  }

  return (
    <div>
      <button className="google-button" type="button" onClick={signIn} disabled={loading}>
        {loading ? <span className="auth-spinner" aria-hidden="true" /> : <GoogleMark />}
        {loading ? "Connecting to Google…" : "Continue with Google"}
      </button>
      {error && <p className="auth-error" role="alert">{error}</p>}
    </div>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="google-mark">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.76 7.18l7.73 6C44.42 38.04 46.98 31.93 46.98 24.55Z" />
      <path fill="#FBBC05" d="M10.53 28.59a14.4 14.4 0 0 1 0-9.18l-7.98-6.19a23.94 23.94 0 0 0 0 21.56l7.98-6.19Z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.9 2.3-8.18 2.3-6.26 0-11.57-4.22-13.46-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" />
    </svg>
  );
}
