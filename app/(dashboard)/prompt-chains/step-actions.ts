"use server";

import { revalidatePath } from "next/cache";
import { requireSuperadmin } from "@/lib/supabase/require-superadmin";
import type { StepActionState } from "./step-state";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function databaseMessage(code: string | undefined) {
  switch (code) {
    case "42501": return "Database permissions are incomplete for step management. Ask an administrator to grant step-table access to authenticated users; the existing RLS policies will still limit writes to superadmins.";
    case "40001": return "This step list changed in another session. It has been refreshed; try your change again.";
    case "23503": return "This step is linked to generation history and cannot be deleted. The history has been preserved.";
    case "P0002": return "The chain or step could not be found. Refresh the page and try again.";
    case "22023": return "The step settings or selected model are invalid. Check the fields and try again.";
    default: return "Could not save the step. Please try again.";
  }
}

async function callStepFunction(args: Record<string, unknown>) {
  const { supabase } = await requireSuperadmin();
  const { data, error } = await supabase.rpc("manage_prompt_chain_step", args);
  return { data, error };
}

export async function savePromptChainStep(
  _previousState: StepActionState,
  formData: FormData,
): Promise<StepActionState> {
  const chainIdValue = formData.get("chain_id");
  const stepIdValue = formData.get("step_id");
  const chainId = typeof chainIdValue === "string" ? chainIdValue.trim() : "";
  const stepId = typeof stepIdValue === "string" ? stepIdValue.trim() : "";
  const name = String(formData.get("name") ?? "").trim();
  const systemPrompt = String(formData.get("system_prompt") ?? "");
  const userPromptTemplate = String(formData.get("user_prompt_template") ?? "");
  const modelId = String(formData.get("model_id") ?? "").trim();
  const rawSettings = String(formData.get("settings") ?? "{}").trim() || "{}";

  const fieldErrors: NonNullable<StepActionState["fieldErrors"]> = {};
  if (!name) fieldErrors.name = "Enter a step name.";
  if (!systemPrompt.trim()) fieldErrors.system_prompt = "Enter a system prompt.";
  if (!userPromptTemplate.trim()) fieldErrors.user_prompt_template = "Enter a user prompt template.";
  if (!uuidPattern.test(modelId)) fieldErrors.model_id = "Choose an active text-capable model.";
  if (Object.keys(fieldErrors).length) return { status: "error", message: "Please fix the highlighted fields.", fieldErrors };
  if (!uuidPattern.test(chainId) || (stepId && !uuidPattern.test(stepId))) {
    return { status: "error", message: "The chain or step identifier is invalid." };
  }

  let settings: unknown;
  try {
    settings = JSON.parse(rawSettings);
  } catch {
    return { status: "error", message: "Please fix the highlighted field.", fieldErrors: { settings: "Enter valid JSON." } };
  }
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return { status: "error", message: "Please fix the highlighted field.", fieldErrors: { settings: "Settings must be a JSON object." } };
  }

  const { error } = await callStepFunction({
    p_operation: stepId ? "update" : "create",
    p_chain_id: chainId,
    p_step_id: stepId || null,
    p_name: name,
    p_system_prompt: systemPrompt,
    p_user_prompt_template: userPromptTemplate,
    p_model_id: modelId,
    p_settings: settings,
    p_expected_step_ids: null,
    p_step_ids: null,
  });
  if (error) return { status: "error", message: databaseMessage(error.code) };

  revalidatePath(`/prompt-chains/${chainId}`);
  revalidatePath("/prompt-chains");
  return { status: "success", message: stepId ? "Step updated." : "Step created." };
}

export async function deletePromptChainStep(
  _previousState: StepActionState,
  formData: FormData,
): Promise<StepActionState> {
  const chainId = String(formData.get("chain_id") ?? "").trim();
  const stepId = String(formData.get("step_id") ?? "").trim();
  if (!uuidPattern.test(chainId) || !uuidPattern.test(stepId)) {
    return { status: "error", message: "The chain or step identifier is invalid." };
  }

  const { error } = await callStepFunction({
    p_operation: "delete",
    p_chain_id: chainId,
    p_step_id: stepId,
    p_name: null,
    p_system_prompt: null,
    p_user_prompt_template: null,
    p_model_id: null,
    p_settings: {},
    p_expected_step_ids: null,
    p_step_ids: null,
  });
  if (error) return { status: "error", message: databaseMessage(error.code) };
  revalidatePath(`/prompt-chains/${chainId}`);
  revalidatePath("/prompt-chains");
  return { status: "success", message: "Step deleted." };
}

export async function reorderPromptChainSteps(
  chainId: string,
  expectedStepIds: string[],
  stepIds: string[],
): Promise<StepActionState> {
  if (!uuidPattern.test(chainId) || [...expectedStepIds, ...stepIds].some((id) => !uuidPattern.test(id))) {
    return { status: "error", message: "The step order contains an invalid identifier." };
  }
  const { error } = await callStepFunction({
    p_operation: "reorder",
    p_chain_id: chainId,
    p_step_id: null,
    p_name: null,
    p_system_prompt: null,
    p_user_prompt_template: null,
    p_model_id: null,
    p_settings: {},
    p_expected_step_ids: expectedStepIds,
    p_step_ids: stepIds,
  });
  if (error) return { status: "error", message: databaseMessage(error.code) };
  revalidatePath(`/prompt-chains/${chainId}`);
  revalidatePath("/prompt-chains");
  return { status: "success", message: "Step order saved." };
}
