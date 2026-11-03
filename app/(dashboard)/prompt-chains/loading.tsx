export default function PromptChainsLoading() {
  return (
    <div className="page-content" aria-busy="true" aria-label="Loading prompt chains">
      <div className="page-heading"><div><p className="eyebrow">WORKSPACE</p><h1>Prompt chains</h1><p className="muted">Loading your prompt chains…</p></div><div className="skeleton-button" /></div>
      <section className="panel chain-list-panel"><div className="skeleton-toolbar" />{[0, 1, 2].map((item) => <div className="skeleton-row" key={item}><div className="skeleton-line skeleton-title" /><div className="skeleton-line skeleton-detail" /><div className="skeleton-line skeleton-meta" /></div>)}</section>
    </div>
  );
}
