import { GoogleSignInButton } from "@/app/components/google-sign-in-button";

export const instant = false;

const messages: Record<string, string> = {
  missing_code: "Google sign-in did not return a code. Please try again.",
  auth_failed: "We could not complete Google sign-in. Please try again.",
  verification_failed: "We could not verify your sign-in. Please try again.",
  signout_failed: "We could not finish signing out. Please try again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; signedOut?: string }>;
}) {
  const { error, signedOut } = await searchParams;

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <div className="auth-brand">
          <span className="brand-emblem">C</span>
          <span className="brand-copy">
            <strong>Prompt Studio</strong>
            <small>COLUMBIA UNIVERSITY</small>
          </span>
        </div>
        <p className="eyebrow">RESTRICTED WORKSPACE</p>
        <h1>Sign in to Prompt Studio</h1>
        <p className="muted">Use your Columbia Google account. Superadmin access is required.</p>
        {signedOut === "1" && <p className="auth-notice" role="status">You have been signed out.</p>}
        {error && <p className="auth-error" role="alert">{messages[error] ?? "We could not sign you in. Please try again."}</p>}
        <GoogleSignInButton />
      </section>
    </main>
  );
}
