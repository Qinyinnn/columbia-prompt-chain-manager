import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperadmin } from "@/lib/supabase/require-superadmin";
import { StepEditor, type ChainStep, type TextModel } from "../step-editor";
import { RunChain } from "../run-chain";

export default async function PromptChainDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireSuperadmin();
  const [{ data: chain, error: chainError }, { data: stepRows, error: stepError }, { data: modelRows, error: modelError }] = await Promise.all([
    supabase.from("prompt_chain_definitions").select("id, name, description, is_active").eq("id", id).maybeSingle(),
    supabase.from("prompt_chain_steps").select("id, chain_id, step_order, name, system_prompt, user_prompt_template, model_id, settings").eq("chain_id", id).order("step_order", { ascending: true }),
    supabase.from("llm_models").select("id, model_key, display_name, capabilities, provider:llm_providers!inner(name, is_active)").eq("is_active", true).eq("provider.is_active", true).filter("capabilities->>text", "eq", "true").order("display_name", { ascending: true }),
  ]);

  if (chainError) return <DetailError message="Could not load this prompt chain. Please try again." />;
  if (!chain) notFound();
  if (stepError) return <DetailError message="Could not load the steps for this chain. Refresh the page to try again." />;

  const steps = (stepRows ?? []) as ChainStep[];
  const models = (modelRows ?? []) as unknown as TextModel[];
  return <div className="page-content">
    <Link href="/prompt-chains" className="back-link detail-back">← Chains</Link>
    <div className="page-heading detail-heading"><div><p className="eyebrow">PROMPT CHAIN</p><h1>{chain.name}</h1><p className="muted">{chain.description || "No description yet."}</p></div><span className={`status-badge ${chain.is_active ? "is-active" : "is-inactive"}`}><span />{chain.is_active ? "Active" : "Inactive"}</span></div>
    {modelError ? <div className="feedback feedback-error model-alert" role="alert">Couldn’t load models. Refresh to try again.</div> : models.length === 0 ? <div className="feedback feedback-blocked model-alert" role="status">No active text models. Activate a text-capable model to add or edit steps.</div> : null}
    <StepEditor chainId={chain.id} steps={steps} models={models} />
    <RunChain chainId={chain.id} isActive={chain.is_active} stepCount={steps.length} />
  </div>;
}

function DetailError({ message }: { message: string }) {
  return <div className="page-content"><p className="feedback feedback-error" role="alert">{message}</p><Link href="/prompt-chains" className="back-link">← Back to prompt chains</Link></div>;
}
