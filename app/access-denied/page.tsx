export default function AccessDeniedPage() {
  return (
    <main className="auth-screen">
      <section className="auth-card access-denied-card">
        <div className="auth-brand">
          <span className="brand-emblem">C</span>
          <span className="brand-copy">
            <strong>Prompt Studio</strong>
            <small>COLUMBIA UNIVERSITY</small>
          </span>
        </div>
        <p className="eyebrow">ACCESS RESTRICTED</p>
        <h1>Administrator access required</h1>
        <p className="muted">This account doesn’t have superadmin access. Contact your project administrator if you need access.</p>
        <form action="/auth/signout" method="post">
          <button className="google-button signout-button" type="submit">Sign out</button>
        </form>
      </section>
    </main>
  );
}
