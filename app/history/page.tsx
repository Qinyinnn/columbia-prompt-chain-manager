import Link from "next/link";

export default function HistoryPage() {
  return <div className="page-content"><div className="page-heading"><div><p className="eyebrow">WORKSPACE</p><h1>Generation history</h1><p className="muted">Review and revisit outputs from your prompt chains.</p></div><span className="count-pill">0 generations</span></div><section className="panel empty-panel"><span className="empty-icon history-icon">◷</span><h2>Your generations will appear here</h2><p className="muted">Once you run a prompt chain, you’ll find its output here.</p><Link href="/prompt-chains" className="button button-primary">Explore prompt chains <span>→</span></Link></section><Link href="/" className="back-link">← Back to overview</Link></div>;
}
