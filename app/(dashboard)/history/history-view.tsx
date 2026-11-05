"use client";

import Link from "next/link";
import { useMemo, useState, type KeyboardEvent } from "react";

export type HistoryChain = {
  id: string;
  name: string;
};

export type HistoryGeneration = {
  id: string;
  situation: string;
  status: string;
  created_at: string;
  title: string | null;
  content: string | null;
  chainId: string | null;
  chainName: string;
  steps: {
    id: string;
    order: number;
    name: string;
    status: string;
    output: string | null;
  }[];
};

type HistoryViewProps = {
  generations: HistoryGeneration[];
  chains: HistoryChain[];
};

const ALL_TAB = "all";

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(value));
}

function matchesSearch(generation: HistoryGeneration, query: string, currentChainName?: string) {
  if (!query) return true;
  const searchableText = [
    generation.chainName,
    currentChainName,
    generation.title,
    generation.situation,
    generation.content,
    ...generation.steps.flatMap((step) => [step.name, step.output]),
  ].filter(Boolean).join(" ").toLocaleLowerCase();
  return searchableText.includes(query);
}

export function HistoryView({ generations, chains }: HistoryViewProps) {
  const [activeTab, setActiveTab] = useState(ALL_TAB);
  const [search, setSearch] = useState("");
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const tabs = useMemo(() => [
    { id: ALL_TAB, name: "All Generations" },
    ...chains.map((chain) => ({ id: chain.id, name: chain.name })),
  ], [chains]);
  const chainNames = useMemo(
    () => new Map(chains.map((chain) => [chain.id, chain.name])),
    [chains],
  );

  const filteredGenerations = generations.filter((generation) =>
    (activeTab === ALL_TAB || generation.chainId === activeTab)
    && matchesSearch(generation, normalizedSearch, generation.chainId ? chainNames.get(generation.chainId) : undefined),
  );

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const currentIndex = tabs.findIndex((tab) => tab.id === activeTab);
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    const nextTab = tabs[nextIndex];
    setActiveTab(nextTab.id);
    document.getElementById(`history-tab-${nextIndex}`)?.focus();
  }

  const activeChain = chains.find((chain) => chain.id === activeTab);

  return (
    <section className="history-workspace" aria-label="Generation history">
      <div className="history-search">
        <span className="history-search-icon" aria-hidden="true">⌕</span>
        <label className="sr-only" htmlFor="history-search-input">Search generations</label>
        <input
          id="history-search-input"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search chains, inputs, and generated text..."
        />
        {search && (
          <button type="button" className="history-search-clear" onClick={() => setSearch("")}>
            Clear
          </button>
        )}
      </div>

      <div className="history-tabs-wrap">
        <div className="history-tabs" role="tablist" aria-label="Filter by prompt chain">
          {tabs.map((tab, index) => {
            const count = tab.id === ALL_TAB
              ? generations.length
              : generations.filter((generation) => generation.chainId === tab.id).length;
            return (
              <button
                key={tab.id}
                id={`history-tab-${index}`}
                className={`history-tab ${activeTab === tab.id ? "active" : ""}`}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls="history-tab-panel"
                tabIndex={activeTab === tab.id ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={handleTabKeyDown}
              >
                <span>{tab.name}</span>
                <span className="history-tab-count">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        className="history-tab-panel"
        id="history-tab-panel"
        role="tabpanel"
        aria-labelledby={`history-tab-${tabs.findIndex((tab) => tab.id === activeTab)}`}
        tabIndex={0}
      >
        <div className="history-results-heading">
          <div>
            <h2>{activeChain?.name ?? "All generations"}</h2>
            <p className="muted" aria-live="polite">
              {normalizedSearch
                ? `${filteredGenerations.length} matching ${filteredGenerations.length === 1 ? "generation" : "generations"}`
                : `${filteredGenerations.length} ${filteredGenerations.length === 1 ? "generation" : "generations"} shown, newest first`}
            </p>
          </div>
        </div>

        {filteredGenerations.length > 0 ? (
          <div className="history-list">
            {filteredGenerations.map((generation) => (
              <GenerationCard key={generation.id} generation={generation} />
            ))}
          </div>
        ) : normalizedSearch ? (
          <section className="panel history-empty history-empty-compact">
            <span className="empty-icon history-icon" aria-hidden="true">⌕</span>
            <h2>No matching generations</h2>
            <p className="muted">Try another chain name, input phrase, or generated text.</p>
            <button type="button" className="button button-secondary" onClick={() => setSearch("")}>
              Clear search
            </button>
          </section>
        ) : generations.length === 0 ? (
          <section className="panel empty-panel history-empty">
            <span className="empty-icon history-icon" aria-hidden="true">◷</span>
            <h2>No generations yet</h2>
            <p className="muted">Run a prompt chain and its results will be saved here.</p>
            <Link href="/prompt-chains" className="button button-primary">
              Browse chains <span aria-hidden="true">→</span>
            </Link>
          </section>
        ) : (
          <section className="panel history-empty history-empty-compact">
            <span className="empty-icon history-icon" aria-hidden="true">◷</span>
            <h2>No generations from this chain</h2>
            <p className="muted">Run {activeChain?.name ?? "this prompt chain"} to see its results here.</p>
            {activeChain && (
              <Link href={`/prompt-chains/${activeChain.id}`} className="button button-primary">
                Open chain <span aria-hidden="true">→</span>
              </Link>
            )}
          </section>
        )}
      </div>
    </section>
  );
}

function GenerationCard({ generation }: { generation: HistoryGeneration }) {
  return (
    <details className="panel history-run">
      <summary className="history-run-summary">
        <span className="history-run-main">
          <span className="eyebrow">{generation.chainName}</span>
          <span className="history-run-title">{generation.title ?? "Generation run"}</span>
          <span className="history-run-preview">{generation.situation}</span>
        </span>
        <span className="history-run-meta">
          <span className={`run-step-status run-step-status-${generation.status}`}>{generation.status}</span>
          <time className="muted" dateTime={generation.created_at}>{formatTimestamp(generation.created_at)}</time>
          <span className="history-disclosure" aria-hidden="true" />
        </span>
      </summary>

      <div className="history-run-details">
        <div className="history-detail-meta">
          <span><span className="history-detail-label">Timestamp</span><time dateTime={generation.created_at}>{formatTimestamp(generation.created_at)}</time></span>
          <span><span className="history-detail-label">Status</span><span className={`run-step-status run-step-status-${generation.status}`}>{generation.status}</span></span>
          {generation.chainId && (
            <Link className="text-link" href={`/prompt-chains/${generation.chainId}`}>Open chain <span aria-hidden="true">→</span></Link>
          )}
        </div>

        <section className="history-detail-section">
          <h3>Original input</h3>
          <p className="history-detail-text">{generation.situation}</p>
        </section>

        <section className="history-detail-section">
          <h3>Intermediate step outputs</h3>
          {generation.steps.length > 0 ? (
            <ol className="history-step-list">
              {generation.steps.map((step) => (
                <li key={step.id}>
                  <div className="history-step-heading">
                    <h4><span>{step.order}</span>{step.name}</h4>
                    <span className={`run-step-status run-step-status-${step.status}`}>{step.status}</span>
                  </div>
                  {step.output
                    ? <pre>{step.output}</pre>
                    : <p className="muted history-no-output">No output recorded for this step.</p>}
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">No step outputs were recorded for this generation.</p>
          )}
        </section>

        <section className="history-detail-section">
          <h3>Final generated text</h3>
          {generation.content
            ? <pre>{generation.content}</pre>
            : <p className="muted">No final output was recorded for this generation.</p>}
        </section>
      </div>
    </details>
  );
}
