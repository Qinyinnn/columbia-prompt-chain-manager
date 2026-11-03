"use server";

import { revalidatePath } from "next/cache";
import { requireSuperadmin } from "@/lib/supabase/require-superadmin";
import type { ChainActionState } from "./action-state";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const permissionErrorMessage = "Database permissions are incomplete for prompt-chain management. Ask a database administrator to grant INSERT, UPDATE, and DELETE to the authenticated role; the existing RLS policies will continue to restrict access to superadmins.";

export async function savePromptChain(
  _previousState: ChainActionState,
  formData: FormData,
): Promise<ChainActionState> {
  const { supabase } = await requireSuperadmin();
  const idValue = formData.get("id");
  const id = typeof idValue === "string" ? idValue.trim() : "";
  const nameValue = formData.get("name");
  const name = typeof nameValue === "string" ? nameValue.trim() : "";
  const descriptionValue = formData.get("description");
  const description = typeof descriptionValue === "string" ? descriptionValue.trim() : "";
  const isActive = formData.get("is_active") === "on";

  if (!name) {
    return { status: "error", message: "Please fix the highlighted field.", fieldErrors: { name: "Enter a chain name." } };
  }
  if (id && !uuidPattern.test(id)) return { status: "error", message: "This chain identifier is invalid." };

  const values = { name, description: description || null, is_active: isActive };
  const result = id
    ? await supabase.from("prompt_chain_definitions").update(values).eq("id", id).select("id").maybeSingle()
    : await supabase.from("prompt_chain_definitions").insert(values).select("id").maybeSingle();

  if (result.error?.code === "23505") {
    return { status: "error", message: "A prompt chain with this name already exists.", fieldErrors: { name: "Choose a name that is not already in use." } };
  }
  if (result.error?.code === "42501") return { status: "error", message: permissionErrorMessage };
  if (result.error) return { status: "error", message: "Could not save the prompt chain. Please try again." };
  if (!result.data) return { status: "error", message: "The prompt chain was not found or could not be saved." };

  revalidatePath("/prompt-chains");
  revalidatePath(`/prompt-chains/${result.data.id}`);
  return { status: "success", message: id ? "Prompt chain updated." : "Prompt chain created." };
}

async function countReferences(
  supabase: Awaited<ReturnType<typeof requireSuperadmin>>["supabase"],
  id: string,
) {
  const [steps, memberships, runs] = await Promise.all([
    supabase.from("prompt_chain_steps").select("id", { count: "exact", head: true }).eq("chain_id", id),
    supabase.from("prompt_chain_mix_members").select("chain_id", { count: "exact", head: true }).eq("chain_id", id),
    supabase.from("prompt_chain_runs").select("chain_id", { count: "exact", head: true }).eq("chain_id", id),
  ]);
  return {
    errors: [steps.error, memberships.error, runs.error].filter(Boolean),
    dependencies: { steps: steps.count ?? 0, mixMemberships: memberships.count ?? 0, runs: runs.count ?? 0 },
  };
}

export async function deletePromptChain(
  _previousState: ChainActionState,
  formData: FormData,
): Promise<ChainActionState> {
  const { supabase } = await requireSuperadmin();
  const idValue = formData.get("id");
  const id = typeof idValue === "string" ? idValue.trim() : "";
  if (!uuidPattern.test(id)) return { status: "error", message: "This chain identifier is invalid." };

  const { errors, dependencies } = await countReferences(supabase, id);
  if (errors.length) return { status: "error", message: "Could not verify chain dependencies, so it was not deleted." };
  if (dependencies.steps || dependencies.mixMemberships || dependencies.runs) {
    return {
      status: "blocked",
      message: "This chain is in use. Its steps or memberships are protected by foreign keys, and its generation history must be preserved. Deactivate it instead.",
      dependencies,
    };
  }

  const { data, error } = await supabase.from("prompt_chain_definitions").delete().eq("id", id).select("id").maybeSingle();
  if (error?.code === "23503") {
    return { status: "blocked", message: "A related record now references this chain. It was not deleted; deactivate it instead." };
  }
  if (error?.code === "42501") return { status: "error", message: permissionErrorMessage };
  if (error) return { status: "error", message: "Could not delete the prompt chain. Please try again." };
  if (!data) return { status: "error", message: "This prompt chain no longer exists." };

  revalidatePath("/prompt-chains");
  revalidatePath(`/prompt-chains/${id}`);
  return { status: "success", message: "Prompt chain deleted." };
}

export async function deactivatePromptChain(
  _previousState: ChainActionState,
  formData: FormData,
): Promise<ChainActionState> {
  const { supabase } = await requireSuperadmin();
  const idValue = formData.get("id");
  const id = typeof idValue === "string" ? idValue.trim() : "";
  if (!uuidPattern.test(id)) return { status: "error", message: "This chain identifier is invalid." };

  const { data, error } = await supabase
    .from("prompt_chain_definitions")
    .update({ is_active: false })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error?.code === "42501") return { status: "error", message: permissionErrorMessage };
  if (error || !data) return { status: "error", message: "Could not deactivate the prompt chain." };

  revalidatePath("/prompt-chains");
  revalidatePath(`/prompt-chains/${id}`);
  return { status: "success", message: "Prompt chain deactivated." };
}
