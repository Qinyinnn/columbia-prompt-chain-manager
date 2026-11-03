import { ChainManager, type PromptChain } from "./chain-manager";
import { requireSuperadmin } from "@/lib/supabase/require-superadmin";

export default async function PromptChainsPage() {
  const { supabase } = await requireSuperadmin();
  const { data, error } = await supabase
    .from("prompt_chain_definitions")
    .select("id, name, description, is_active, created_at, updated_at, prompt_chain_steps(count)")
    .order("name", { ascending: true });

  if (error) {
    return <div className="page-content"><div className="page-heading"><div><p className="eyebrow">WORKSPACE</p><h1>Prompt chains</h1></div></div><div className="feedback feedback-error" role="alert">We couldn’t load prompt chains. Refresh the page to try again.</div></div>;
  }

  return <ChainManager chains={(data ?? []) as PromptChain[]} />;
}
