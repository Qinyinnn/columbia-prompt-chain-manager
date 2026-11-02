import Link from "next/link";

export default function PromptChainsPage() {
  return <div className="page-content"><div className="page-heading"><div><p className="eyebrow">WORKSPACE</p><h1>Prompt chains</h1><p className="muted">Build reusable workflows from connected prompts.</p></div><button className="button button-primary" type="button"><span>＋</span> New prompt chain</button></div><section className="panel empty-panel"><span className="empty-icon">⌘</span><h2>Your prompt chains will live here</h2><p className="muted">Create a chain to bring your prompts together in a repeatable workflow.</p><button className="button button-primary" type="button">Create your first chain</button></section><Link href="/" className="back-link">← Back to overview</Link></div>;
}
