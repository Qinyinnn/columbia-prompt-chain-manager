import Link from "next/link";

const activity = [
  { initials: "RK", name: "Research brief", detail: "Updated a prompt chain", time: "12 min ago", color: "violet" },
  { initials: "AM", name: "Product copy v2", detail: "Generated a new run", time: "48 min ago", color: "amber" },
  { initials: "JL", name: "Support response", detail: "Created a prompt chain", time: "Yesterday", color: "green" },
];

export default function Home() {
  return (
    <div className="page-content">
      <div className="page-heading">
        <div><p className="eyebrow">MONDAY, NOVEMBER 2, 2026</p><h1>Good morning, Alex <span>✳</span></h1><p className="muted">Here’s what’s happening with your prompt workspace.</p></div>
        <Link href="/prompt-chains" className="button button-primary"><span>＋</span> New prompt chain</Link>
      </div>

      <section className="stats-grid" aria-label="Workspace overview">
        <article className="stat-card"><div className="stat-top"><span className="stat-label">Total prompt chains</span><span className="stat-icon blue">⌘</span></div><div className="stat-value">12</div><div className="stat-foot"><span className="trend">↗ 2</span><span>from last month</span></div></article>
        <article className="stat-card"><div className="stat-top"><span className="stat-label">Generations this week</span><span className="stat-icon purple">✳</span></div><div className="stat-value">248</div><div className="stat-foot"><span className="trend">↗ 18.4%</span><span>from last week</span></div></article>
        <article className="stat-card"><div className="stat-top"><span className="stat-label">Time saved</span><span className="stat-icon mint">◷</span></div><div className="stat-value">6.2 <small>hrs</small></div><div className="stat-foot"><span>Across all generations</span></div></article>
      </section>

      <section className="dashboard-grid">
        <article className="panel activity-panel">
          <div className="panel-heading"><div><h2>Recent activity</h2><p className="muted">The latest from your workspace</p></div><Link className="text-link" href="/history">View history <span>→</span></Link></div>
          <div className="activity-list">{activity.map((item) => <div className="activity-row" key={item.name}><span className={`avatar ${item.color}`}>{item.initials}</span><div className="activity-copy"><strong>{item.name}</strong><span>{item.detail}</span></div><time>{item.time}</time></div>)}</div>
        </article>
        <article className="panel quick-panel"><div className="panel-heading"><div><h2>Quick start</h2><p className="muted">Jump back into your work</p></div></div>
          <Link className="quick-link" href="/prompt-chains"><span className="quick-icon">⌘</span><span><strong>Prompt chains</strong><small>Organize and refine your prompts</small></span><span className="arrow">→</span></Link>
          <Link className="quick-link" href="/history"><span className="quick-icon lavender">◷</span><span><strong>Generation history</strong><small>Review your recent outputs</small></span><span className="arrow">→</span></Link>
        </article>
      </section>
      <div className="welcome-banner"><span className="banner-mark">✳</span><div><strong>Your workspace is ready</strong><p>Create a prompt chain to start building repeatable workflows.</p></div><Link href="/prompt-chains" className="banner-link">Explore prompt chains <span>→</span></Link></div>
      <footer className="page-footer">Built for thoughtful work <span>·</span> Columbia Blue <span className="footer-dot">●</span></footer>
    </div>
  );
}
