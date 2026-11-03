"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import {
  deactivatePromptChain,
  deletePromptChain,
  savePromptChain,
} from "./actions";
import { initialChainActionState } from "./action-state";

export type PromptChain = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  prompt_chain_steps: { count: number }[];
};

function ChainForm({
  chain,
  onClose,
  onSuccess,
}: {
  chain?: PromptChain;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [state, action, pending] = useActionState(savePromptChain, initialChainActionState);

  useEffect(() => {
    if (state.status === "success") onSuccess(state.message);
  }, [state.status, state.message, onSuccess]);

  return (
    <form action={action} className="chain-form">
      {chain && <input type="hidden" name="id" value={chain.id} />}
      <label className="field-label" htmlFor="chain-name">Name</label>
      <input id="chain-name" className="text-input" name="name" defaultValue={chain?.name ?? ""} required autoFocus aria-invalid={Boolean(state.fieldErrors?.name)} aria-describedby={state.fieldErrors?.name ? "chain-name-error" : undefined} />
      {state.fieldErrors?.name && <p id="chain-name-error" className="field-error">{state.fieldErrors.name}</p>}

      <label className="field-label" htmlFor="chain-description">Description <span className="muted">Optional</span></label>
      <textarea id="chain-description" className="text-input text-area" name="description" defaultValue={chain?.description ?? ""} rows={3} placeholder="Optional summary" />

      <label className="check-label"><input type="checkbox" name="is_active" defaultChecked={chain?.is_active ?? false} /> <span>Active</span></label>
      {state.message && <p className={`feedback feedback-${state.status}`} role={state.status === "success" ? "status" : "alert"}>{state.message}</p>}
      <div className="dialog-actions">
        <button type="button" className="button button-secondary" onClick={onClose} disabled={pending}>Cancel</button>
        <button type="submit" className="button button-primary" disabled={pending}>{pending ? "Saving…" : chain ? "Save changes" : "Create chain"}</button>
      </div>
    </form>
  );
}

function DeleteChainForm({ chain, onClose, onSuccess }: { chain: PromptChain; onClose: () => void; onSuccess: (message: string) => void }) {
  const [state, action, pending] = useActionState(deletePromptChain, initialChainActionState);
  const [deactivateState, deactivateAction, deactivating] = useActionState(deactivatePromptChain, initialChainActionState);

  useEffect(() => {
    if (state.status === "success") onSuccess(state.message);
    else if (deactivateState.status === "success") onSuccess(deactivateState.message);
  }, [state.status, state.message, deactivateState.status, deactivateState.message, onSuccess]);

  const message = deactivateState.status !== "idle" ? deactivateState.message : state.message;
  return (
    <div>
      <p className="dialog-description">Delete <strong>{chain.name}</strong>? This can’t be undone.</p>
      {message && <div className={`feedback feedback-${deactivateState.status !== "idle" ? deactivateState.status : state.status}`} role="alert">{message}</div>}
      {state.status === "blocked" && state.dependencies && <ul className="dependency-list">
        {state.dependencies.steps > 0 && <li>{state.dependencies.steps} step{state.dependencies.steps === 1 ? "" : "s"}</li>}
        {state.dependencies.mixMemberships > 0 && <li>{state.dependencies.mixMemberships} mix membership{state.dependencies.mixMemberships === 1 ? "" : "s"}</li>}
        {state.dependencies.runs > 0 && <li>{state.dependencies.runs} generation run{state.dependencies.runs === 1 ? "" : "s"}</li>}
      </ul>}
      <div className="dialog-actions">
        <button type="button" className="button button-secondary" onClick={onClose} disabled={pending || deactivating}>Cancel</button>
        {state.status === "blocked" ? (
          <form action={deactivateAction}>
            <input type="hidden" name="id" value={chain.id} />
            <button className="button button-primary" disabled={deactivating}>{deactivating ? "Deactivating…" : "Deactivate instead"}</button>
          </form>
        ) : (
          <form action={action}>
            <input type="hidden" name="id" value={chain.id} />
            <button type="submit" className="button button-danger" disabled={pending}>{pending ? "Checking…" : "Delete chain"}</button>
          </form>
        )}
      </div>
    </div>
  );
}

export function ChainManager({ chains }: { chains: PromptChain[] }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modal, setModal] = useState<"create" | { edit: PromptChain } | { delete: PromptChain } | null>(null);
  const [notice, setNotice] = useState("");
  const closeModal = useMemo(() => () => setModal(null), []);
  const onSuccess = useMemo(() => (message: string) => { setNotice(message); setModal(null); }, []);
  const filtered = chains.filter((chain) => {
    const needle = query.trim().toLocaleLowerCase();
    const matchesText = !needle || chain.name.toLocaleLowerCase().includes(needle) || (chain.description ?? "").toLocaleLowerCase().includes(needle);
    const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? chain.is_active : !chain.is_active);
    return matchesText && matchesStatus;
  });

  return (
    <>
      <div className="page-content">
        <div className="page-heading">
          <div><p className="eyebrow">WORKSPACE</p><h1>Prompt chains</h1><p className="muted">Build workflows from reusable steps.</p></div>
          <button className="button button-primary" type="button" onClick={() => setModal("create")}><span aria-hidden="true">＋</span> New chain</button>
        </div>

        {notice && <div className="feedback feedback-success chain-notice" role="status">{notice}<button type="button" className="notice-close" onClick={() => setNotice("")} aria-label="Dismiss message">×</button></div>}
        <section className="panel chain-list-panel" aria-label="Prompt chains">
          <div className="chain-toolbar">
            <label className="search-wrap"><span aria-hidden="true">⌕</span><input aria-label="Search prompt chains" className="text-input search-input" placeholder="Search chains…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
            <label className="filter-label"><span className="sr-only">Filter by status</span><select className="text-input status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
            <span className="count-pill">{filtered.length} {filtered.length === 1 ? "chain" : "chains"}</span>
          </div>
          {filtered.length ? <div className="chain-list">
            {filtered.map((chain) => {
              const stepCount = chain.prompt_chain_steps?.[0]?.count ?? 0;
              return <article className="chain-row" key={chain.id}>
                <div className="chain-main">
                  <Link href={`/prompt-chains/${chain.id}`} className="chain-name">{chain.name}<span aria-hidden="true">↗</span></Link>
                  <p className="chain-description">{chain.description || "No description yet."}</p>
                  <div className="chain-meta"><span className={`status-badge ${chain.is_active ? "is-active" : "is-inactive"}`}><span />{chain.is_active ? "Active" : "Inactive"}</span><span>{stepCount} step{stepCount === 1 ? "" : "s"}</span></div>
                </div>
                <div className="chain-actions"><Link className="button button-secondary" href={`/prompt-chains/${chain.id}`}>Open</Link><button className="button button-secondary" type="button" onClick={() => setModal({ edit: chain })}>Edit</button><button className="icon-button danger-text" type="button" aria-label={`Delete ${chain.name}`} title="Delete chain" onClick={() => setModal({ delete: chain })}>×</button></div>
              </article>;
            })}
          </div> : <div className="chain-empty"><span className="empty-icon">⌘</span><h2>{chains.length ? "No matching prompt chains" : "Your prompt chains will live here"}</h2><p className="muted">{chains.length ? "Try a different search or status filter." : "Create a chain to bring your prompts together in a repeatable workflow."}</p>{!chains.length && <button className="button button-primary" type="button" onClick={() => setModal("create")}>Create your first chain</button>}</div>}
        </section>
        <Link href="/" className="back-link">← Back to overview</Link>
      </div>

      {modal && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}><section className="dialog panel" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <div className="dialog-heading"><div><p className="eyebrow">PROMPT CHAINS</p><h2 id="dialog-title">{modal === "create" ? "Create a chain" : "edit" in modal ? "Edit chain" : "Delete chain"}</h2></div><button className="icon-button" type="button" onClick={closeModal} aria-label="Close dialog">×</button></div>
        {modal === "create" ? <ChainForm onClose={closeModal} onSuccess={onSuccess} /> : "edit" in modal ? <ChainForm chain={modal.edit} onClose={closeModal} onSuccess={onSuccess} /> : <DeleteChainForm chain={modal.delete} onClose={closeModal} onSuccess={onSuccess} />}
      </section></div>}
    </>
  );
}
