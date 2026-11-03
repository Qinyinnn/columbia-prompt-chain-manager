import Link from "next/link";
import { requireSuperadmin } from "@/lib/supabase/require-superadmin";

type GenerationHistoryRow = {
  id: string;
  situation: string;
  status: string;
  created_at: string;
  title: string | null;
  content: string | null;
  prompt_chain_runs: Array<{
    chain_id: string | null;
    chain_name_snapshot: string;
  }>;
};

export default async function HistoryPage() {
  const { supabase } = await requireSuperadmin();
  const { data, error, count } = await supabase
    .from("generation_requests")
    .select("id, situation, status, created_at, title, content, prompt_chain_runs(chain_id, chain_name_snapshot)", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return <div className="page-content">
      <div className="page-heading"><div><p className="eyebrow">WORKSPACE</p><h1>Run history</h1><p className="muted">Saved prompt-chain results.</p></div></div>
      <p className="feedback feedback-error" role="alert">Could not load generation history. Refresh the page to try again.</p>
      <Link href="/" className="back-link">← Back to overview</Link>
    </div>;
  }

  const runs = (data ?? []) as GenerationHistoryRow[];
  return <div className="page-content">
    <div className="page-heading">
      <div><p className="eyebrow">WORKSPACE</p><h1>Run history</h1><p className="muted">Saved prompt-chain results.</p></div>
      <span className="count-pill">{count ?? runs.length} generations</span>
    </div>
    {runs.length === 0
      ? <section className="panel empty-panel"><span className="empty-icon history-icon" aria-hidden="true">◷</span><h2>No runs yet</h2><p className="muted">Run a chain to see its results here.</p><Link href="/prompt-chains" className="button button-primary">Browse chains <span aria-hidden="true">→</span></Link></section>
      : <section className="history-list" aria-label="Generation history">
        {runs.map((run) => {
          const chain = run.prompt_chain_runs[0];
          const content = run.content;
          const row = <article className="panel history-run" key={run.id}>
            <div className="history-run-heading">
              <div><p className="eyebrow">{chain?.chain_name_snapshot ?? "Prompt chain run"}</p><h2>{run.title ?? "Generation run"}</h2></div>
              <span className={`run-step-status run-step-status-${run.status}`}>{run.status}</span>
            </div>
            <time className="muted" dateTime={run.created_at}>{new Date(run.created_at).toLocaleString()}</time>
            <p className="history-run-input">{run.situation}</p>
            {content && <pre>{content}</pre>}
          </article>;

          return chain?.chain_id
            ? <Link className="history-run-link" href={`/prompt-chains/${chain.chain_id}`} key={run.id}>{row}</Link>
            : <div key={run.id}>{row}</div>;
        })}
      </section>}
    <Link href="/" className="back-link">← Overview</Link>
  </div>;
}
