import Link from "next/link";
import { requireSuperadmin } from "@/lib/supabase/require-superadmin";

export default async function Home() {
  const { user, profile, supabase } = await requireSuperadmin();
  const [chainsResult, activeChainsResult, runsResult] = await Promise.all([
    supabase.from("prompt_chain_definitions").select("id", { count: "exact", head: true }),
    supabase.from("prompt_chain_definitions").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("generation_requests").select("id", { count: "exact", head: true }),
  ]);
  const metricsUnavailable = chainsResult.error || activeChainsResult.error || runsResult.error;
  const profileName = [profile.first_name, profile.last_name]
    .filter((part): part is string => Boolean(part))
    .join(" ");
  const metadataName = user.user_metadata?.full_name ?? user.user_metadata?.name;
  const name =
    profileName ||
    (typeof metadataName === "string" ? metadataName : "") ||
    user.email?.split("@")[0] ||
    "there";

  return (
    <div className="page-content">
      <div className="page-heading">
        <div><p className="eyebrow">OVERVIEW</p><h1>Welcome, {name}</h1><p className="muted">Manage and run your prompt chains.</p></div>
        <Link href="/prompt-chains" className="button button-primary"><span aria-hidden="true">＋</span> New chain</Link>
      </div>

      <section className="stats-grid" aria-label="Workspace overview">
        <article className="stat-card"><div className="stat-top"><span className="stat-label">Chains</span><span className="stat-icon blue" aria-hidden="true">⌘</span></div><div className="stat-value">{metricsUnavailable ? "—" : chainsResult.count ?? 0}</div><div className="stat-foot">All prompt chains</div></article>
        <article className="stat-card"><div className="stat-top"><span className="stat-label">Active chains</span><span className="stat-icon mint" aria-hidden="true">●</span></div><div className="stat-value">{metricsUnavailable ? "—" : activeChainsResult.count ?? 0}</div><div className="stat-foot">Ready to run</div></article>
        <article className="stat-card"><div className="stat-top"><span className="stat-label">Runs</span><span className="stat-icon purple" aria-hidden="true">◷</span></div><div className="stat-value">{metricsUnavailable ? "—" : runsResult.count ?? 0}</div><div className="stat-foot">Saved in history</div></article>
      </section>
      {metricsUnavailable && <p className="feedback feedback-error" role="status">Workspace totals are unavailable.</p>}

      <section className="dashboard-grid">
        <article className="panel quick-panel">
          <div className="panel-heading"><div><h2>Prompt chains</h2><p className="muted">Create, edit, and run workflows.</p></div></div>
          <Link className="quick-link" href="/prompt-chains"><span className="quick-icon" aria-hidden="true">⌘</span><span><strong>Manage chains</strong><small>Set up steps and models</small></span><span className="arrow" aria-hidden="true">→</span></Link>
        </article>
        <article className="panel quick-panel">
          <div className="panel-heading"><div><h2>Run history</h2><p className="muted">Review saved results.</p></div></div>
          <Link className="quick-link" href="/history"><span className="quick-icon lavender" aria-hidden="true">◷</span><span><strong>View history</strong><small>See previous chain runs</small></span><span className="arrow" aria-hidden="true">→</span></Link>
        </article>
      </section>
    </div>
  );
}
