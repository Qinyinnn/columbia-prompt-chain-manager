import Link from "next/link";
import { HistoryView, type HistoryChain, type HistoryGeneration } from "./history-view";
import { requireSuperadmin } from "@/lib/supabase/require-superadmin";

const PAGE_SIZE = 500;
const STEP_PAGE_SIZE = 1000;

type GenerationRequestRow = {
  id: string;
  situation: string;
  status: string;
  created_at: string;
  title: string | null;
  content: string | null;
};

type ChainRunRow = {
  generation_request_id: string;
  chain_id: string | null;
  chain_name_snapshot: string;
};

type StepRunRow = {
  id: string;
  generation_request_id: string;
  step_order: number;
  step_name_snapshot: string;
  status: string;
  output: string | null;
};

export default async function HistoryPage() {
  const { supabase } = await requireSuperadmin();
  const generations: HistoryGeneration[] = [];
  let totalCount = 0;
  let offset = 0;

  while (true) {
    const requestResult = await supabase
      .from("generation_requests")
      .select("id, situation, status, created_at, title, content", { count: offset === 0 ? "exact" : undefined })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (requestResult.error) {
      return <HistoryLoadError />;
    }

    const requests = (requestResult.data ?? []) as GenerationRequestRow[];
    if (offset === 0) totalCount = requestResult.count ?? requests.length;
    if (requests.length === 0) break;

    const ids = requests.map((request) => request.id);
    const chainRunsResult = await supabase
      .from("prompt_chain_runs")
      .select("generation_request_id, chain_id, chain_name_snapshot")
      .in("generation_request_id", ids);

    if (chainRunsResult.error) {
      return <HistoryLoadError />;
    }

    const chainRuns = (chainRunsResult.data ?? []) as ChainRunRow[];
    const stepRuns: StepRunRow[] = [];
    let stepOffset = 0;
    while (true) {
      const stepRunsResult = await supabase
        .from("prompt_chain_step_runs")
        .select("id, generation_request_id, step_order, step_name_snapshot, status, output")
        .in("generation_request_id", ids)
        .order("generation_request_id", { ascending: true })
        .order("step_order", { ascending: true })
        .range(stepOffset, stepOffset + STEP_PAGE_SIZE - 1);
      if (stepRunsResult.error) {
        return <HistoryLoadError />;
      }

      const page = (stepRunsResult.data ?? []) as StepRunRow[];
      stepRuns.push(...page);
      if (page.length < STEP_PAGE_SIZE) break;
      stepOffset += STEP_PAGE_SIZE;
    }

    const chainByGeneration = new Map(
      chainRuns.map((chainRun) => [chainRun.generation_request_id, chainRun]),
    );
    const stepsByGeneration = new Map<string, HistoryGeneration["steps"]>();

    for (const step of stepRuns) {
      const steps = stepsByGeneration.get(step.generation_request_id) ?? [];
      steps.push({
        id: step.id,
        order: step.step_order,
        name: step.step_name_snapshot,
        status: step.status,
        output: step.output,
      });
      stepsByGeneration.set(step.generation_request_id, steps);
    }

    generations.push(...requests.map((request) => {
      const chainRun = chainByGeneration.get(request.id);
      return {
        ...request,
        chainId: chainRun?.chain_id ?? null,
        chainName: chainRun?.chain_name_snapshot ?? "Prompt chain run",
        steps: stepsByGeneration.get(request.id) ?? [],
      };
    }));

    if (requests.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  const chainResult = await supabase
    .from("prompt_chain_definitions")
    .select("id, name")
    .order("name", { ascending: true });

  if (chainResult.error) {
    return <HistoryLoadError />;
  }

  const chainsById = new Map<string, HistoryChain>(
    (chainResult.data ?? []).map((chain) => [chain.id, { id: chain.id, name: chain.name }]),
  );
  for (const generation of generations) {
    if (generation.chainId && !chainsById.has(generation.chainId)) {
      chainsById.set(generation.chainId, { id: generation.chainId, name: generation.chainName });
    }
  }

  const chains = [...chainsById.values()].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="page-content history-page">
      <div className="page-heading history-page-heading">
        <div>
          <p className="eyebrow">WORKSPACE</p>
          <h1>Generation history</h1>
          <p className="muted">Search, review, and revisit results from your prompt chains.</p>
        </div>
        <span className="count-pill">{totalCount} {totalCount === 1 ? "generation" : "generations"}</span>
      </div>
      <HistoryView generations={generations} chains={chains} />
      <Link href="/" className="back-link">← Overview</Link>
    </div>
  );
}

function HistoryLoadError() {
  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">WORKSPACE</p>
          <h1>Generation history</h1>
          <p className="muted">Saved prompt-chain results.</p>
        </div>
      </div>
      <p className="feedback feedback-error" role="alert">
        Could not load generation history. Refresh the page to try again.
      </p>
      <Link href="/" className="back-link">← Back to overview</Link>
    </div>
  );
}
