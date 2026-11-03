import "server-only";

import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  generateStepText,
  ProviderCallError,
  renderStepPrompts,
  type StepConfiguration,
} from "@/lib/ai/prompt-chain-runner";

export const maxDuration = 300;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_INPUT_LENGTH = 5_000;
const MAX_CHAIN_STEPS = 8;
const STALE_RUN_MS = 15 * 60 * 1_000;

type RouteParams = { params: Promise<{ id: string }> };
type DatabaseError = { code?: string };
type RunStatus = "pending" | "running" | "succeeded" | "failed" | "interrupted";

class DatabaseOperationError extends Error {
  readonly code: string;

  constructor(code: string | undefined) {
    super("A generation-history database operation failed.");
    this.name = "DatabaseOperationError";
    this.code = code ?? "unknown";
  }
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate" },
  });
}

function assertNoDatabaseError(error: DatabaseError | null) {
  if (error) throw new DatabaseOperationError(error.code);
}

function isMissingIdempotencyColumn(error: DatabaseError | null) {
  return error?.code === "42703" || error?.code === "PGRST204";
}

async function authenticateSuperadmin() {
  await connection();
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return { response: jsonResponse({ error: "Authentication services are not configured." }, 503) };
  }
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) return { response: jsonResponse({ error: "Sign in to run a prompt chain." }, 401) };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("is_superadmin")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return { response: jsonResponse({ error: "Could not verify workspace permissions." }, 503) };
  }
  if (profile?.is_superadmin !== true) {
    return { response: jsonResponse({ error: "Superadmin access is required to run a prompt chain." }, 403) };
  }

  return { supabase, user };
}

function parseRequestBody(value: unknown) {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const input = typeof record.input === "string" ? record.input.trim() : "";
  const idempotencyKey = typeof record.idempotencyKey === "string"
    ? record.idempotencyKey.trim()
    : "";

  if (!input || input.length > MAX_INPUT_LENGTH || !UUID_PATTERN.test(idempotencyKey)) return null;
  return { input, idempotencyKey };
}

async function readBoundedJson(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return { kind: "invalid" as const };

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > 12_000) {
      await reader.cancel();
      return { kind: "too_large" as const };
    }
    chunks.push(value);
  }

  const bodyBytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bodyBytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return { kind: "parsed" as const, body: JSON.parse(new TextDecoder().decode(bodyBytes)) as unknown };
  } catch {
    return { kind: "invalid" as const };
  }
}

function isTextCapable(step: StepConfiguration) {
  return step.model.is_active === true
    && step.model.capabilities?.text === true
    && step.model.provider?.is_active === true;
}

function safeRunError(error: unknown) {
  if (error instanceof ProviderCallError) {
    return { code: error.code, message: error.message, responseState: error.responseState, httpStatus: error.responseStatus };
  }
  if (error instanceof DatabaseOperationError) {
    return {
      code: "generation_history_error",
      message: "The run could not be saved to generation history. Contact an administrator.",
      responseState: "failed" as const,
      httpStatus: null,
    };
  }
  return {
    code: "generation_error",
    message: "The prompt chain could not be completed. Review the prompts and try again.",
    responseState: "failed" as const,
    httpStatus: null,
  };
}

async function fetchRunSnapshot(
  service: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  idempotencyKey: string,
) {
  const requestResult = await service
    .from("generation_requests")
    .select("id, situation, status, title, content, error_code, error_message, started_at")
    .eq("user_id", userId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (requestResult.error) throw new DatabaseOperationError(requestResult.error.code);
  if (!requestResult.data) return null;

  const requestRow = requestResult.data;
  const [chainRunResult, stepResult] = await Promise.all([
    service
      .from("prompt_chain_runs")
      .select("id, chain_id, chain_name_snapshot, status, started_at")
      .eq("generation_request_id", requestRow.id)
      .maybeSingle(),
    service
      .from("prompt_chain_step_runs")
      .select("id, step_order, step_name_snapshot, status, output, error_code, error_message")
      .eq("generation_request_id", requestRow.id)
      .order("step_order", { ascending: true }),
  ]);
  assertNoDatabaseError(chainRunResult.error);
  assertNoDatabaseError(stepResult.error);

  return { requestRow, chainRun: chainRunResult.data, steps: stepResult.data ?? [] };
}

function duplicateResponse(snapshot: NonNullable<Awaited<ReturnType<typeof fetchRunSnapshot>>>) {
  return {
    requestId: snapshot.requestRow.id,
    status: snapshot.requestRow.status as RunStatus,
    chainName: snapshot.chainRun?.chain_name_snapshot ?? null,
    finalOutput: snapshot.requestRow.content,
    error: snapshot.requestRow.error_message,
    steps: snapshot.steps.map((step) => ({
      id: step.id,
      stepOrder: step.step_order,
      name: step.step_name_snapshot,
      status: step.status,
      output: step.output,
      error: step.error_message,
    })),
  };
}

async function markStaleRunInterrupted(
  service: ReturnType<typeof createServiceRoleClient>,
  snapshot: NonNullable<Awaited<ReturnType<typeof fetchRunSnapshot>>>,
) {
  const endedAt = new Date().toISOString();
  const results = await Promise.all([
    service.from("generation_requests").update({
      status: "interrupted",
      completed_at: endedAt,
      error_code: "execution_interrupted",
      error_message: "This run stopped before it could finish. Start a new run to retry.",
    }).eq("id", snapshot.requestRow.id),
    service.from("prompt_chain_runs").update({
      status: "interrupted",
      completed_at: endedAt,
      error_code: "execution_interrupted",
      error_message: "This run stopped before it could finish.",
    }).eq("generation_request_id", snapshot.requestRow.id).eq("status", "running"),
    service.from("prompt_chain_step_runs").update({
      status: "interrupted",
      completed_at: endedAt,
      error_code: "execution_interrupted",
      error_message: "This run stopped before this step could finish.",
    }).eq("generation_request_id", snapshot.requestRow.id).eq("status", "running"),
    service.from("llm_responses").update({
      status: "interrupted",
      completed_at: endedAt,
      error_code: "execution_interrupted",
      error_message: "This run stopped before the provider response was saved.",
    }).eq("generation_request_id", snapshot.requestRow.id).in("status", ["pending", "running"]),
  ]);
  for (const result of results) assertNoDatabaseError(result.error);
}

async function getDuplicateResponse(
  service: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  idempotencyKey: string,
  input: string,
  chainId: string,
) {
  const snapshot = await fetchRunSnapshot(service, userId, idempotencyKey);
  if (!snapshot) return null;
  if (snapshot.requestRow.situation !== input) {
    return jsonResponse({ error: "This request key was already used with different input." }, 409);
  }
  if (snapshot.chainRun && snapshot.chainRun.chain_id !== chainId) {
    return jsonResponse({ error: "This request key was already used for a different chain." }, 409);
  }

  const isActive = snapshot.requestRow.status === "pending" || snapshot.requestRow.status === "running";
  if (isActive) {
    const started = Date.parse(snapshot.requestRow.started_at ?? "");
    if (!Number.isFinite(started) || Date.now() - started > STALE_RUN_MS) {
      await markStaleRunInterrupted(service, snapshot);
      const refreshed = await fetchRunSnapshot(service, userId, idempotencyKey);
      if (!refreshed) throw new DatabaseOperationError("missing_after_interruption");
      return jsonResponse(duplicateResponse(refreshed));
    }
  }

  const payload = duplicateResponse(snapshot);
  return jsonResponse(payload, isActive ? 202 : 200);
}

async function markRunFailed(
  service: ReturnType<typeof createServiceRoleClient>,
  requestId: string,
  chainRunId: string,
  runStartedAt: number,
  requestError: { code: string; message: string; responseState: string; httpStatus: number | null },
  currentStepRunId: string | null,
  currentStepStartedAt: number | null,
  currentResponseId: string | null,
  currentResponseStartedAt: number | null,
) {
  const completedAt = new Date().toISOString();
  const durationMs = Math.max(0, Date.now() - runStartedAt);
  const requestUpdate = await service.from("generation_requests").update({
    status: "failed",
    completed_at: completedAt,
    duration_ms: durationMs,
    error_code: requestError.code,
    error_message: requestError.message,
  }).eq("id", requestId);
  assertNoDatabaseError(requestUpdate.error);

  const chainUpdate = await service.from("prompt_chain_runs").update({
    status: "failed",
    completed_at: completedAt,
    duration_ms: durationMs,
    error_code: requestError.code,
    error_message: requestError.message,
  }).eq("id", chainRunId);
  assertNoDatabaseError(chainUpdate.error);

  if (currentStepRunId) {
    const stepUpdate = await service.from("prompt_chain_step_runs").update({
      status: "failed",
      completed_at: completedAt,
      duration_ms: currentStepStartedAt === null ? null : Math.max(0, Date.now() - currentStepStartedAt),
      error_code: requestError.code,
      error_message: requestError.message,
    }).eq("id", currentStepRunId);
    assertNoDatabaseError(stepUpdate.error);
  }
  if (currentResponseId) {
    const responseStatus = requestError.responseState === "timed_out" || requestError.responseState === "rate_limited"
      ? requestError.responseState
      : "failed";
    const responseUpdate = await service.from("llm_responses").update({
      status: responseStatus,
      completed_at: completedAt,
      duration_ms: currentResponseStartedAt === null ? null : Math.max(0, Date.now() - currentResponseStartedAt),
      http_status: requestError.httpStatus,
      error_code: requestError.code,
      error_message: requestError.message,
    }).eq("id", currentResponseId);
    assertNoDatabaseError(responseUpdate.error);
  }
}

function encodeEvent(event: Record<string, unknown>) {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

function asProviderKey(providerName: string) {
  if (providerName.trim().toLowerCase() === "deepseek") return process.env.DEEPSEEK_API_KEY;
  return undefined;
}

async function executeRun(
  service: ReturnType<typeof createServiceRoleClient>,
  requestId: string,
  chainRunId: string,
  chain: { id: string; name: string },
  steps: StepConfiguration[],
  input: string,
  apiKey: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
) {
  const send = (event: Record<string, unknown>) => controller.enqueue(encodeEvent(event));
  const runStartedAt = Date.now();
  let previousOutput = "";
  let currentStepRunId: string | null = null;
  let currentStepStartedAt: number | null = null;
  let currentResponseId: string | null = null;
  let currentResponseStartedAt: number | null = null;
  let activeIndex = -1;

  try {
    send({ type: "started", requestId, chainName: chain.name, totalSteps: steps.length });

    for (let index = 0; index < steps.length; index += 1) {
      activeIndex = index;
      const step = steps[index];
      const prompts = renderStepPrompts(step, {
        input,
        situation: input,
        previous_output: previousOutput,
      });
      send({
        type: "step_started",
        stepOrder: step.step_order,
        name: step.name,
        totalSteps: steps.length,
      });

      const now = new Date().toISOString();
      currentStepStartedAt = Date.now();
      const stepResult = await service.from("prompt_chain_step_runs").insert({
        generation_request_id: requestId,
        chain_run_id: chainRunId,
        step_id: step.id,
        step_name_snapshot: step.name,
        step_order: step.step_order,
        attempt_no: 1,
        resolved_system_prompt: prompts.systemPrompt,
        resolved_user_prompt: prompts.userPrompt,
        input: { input, situation: input, previous_output: previousOutput },
        model_id: step.model.id,
        provider_name_snapshot: step.model.provider.name,
        model_key_snapshot: step.model.model_key,
        status: "running",
        started_at: now,
      }).select("id").single();
      assertNoDatabaseError(stepResult.error);
      if (!stepResult.data) throw new DatabaseOperationError("missing_step_run_id");
      currentStepRunId = stepResult.data.id;

      currentResponseStartedAt = Date.now();
      const responseResult = await service.from("llm_responses").insert({
        generation_request_id: requestId,
        step_run_id: currentStepRunId,
        call_kind: "chain_step",
        attempt_no: 1,
        model_id: step.model.id,
        provider_name_snapshot: step.model.provider.name,
        model_key_snapshot: step.model.model_key,
        request_payload: { model: step.model.model_key, message_count: 2, stream: false },
        status: "running",
        started_at: now,
      }).select("id").single();
      assertNoDatabaseError(responseResult.error);
      if (!responseResult.data) throw new DatabaseOperationError("missing_response_id");
      currentResponseId = responseResult.data.id;

      const result = await generateStepText(step, prompts, apiKey);
      const completedAt = new Date().toISOString();
      const [stepUpdate, responseUpdate] = await Promise.all([
        service.from("prompt_chain_step_runs").update({
          status: "succeeded",
          output: result.text,
          completed_at: completedAt,
          duration_ms: result.durationMs,
        }).eq("id", currentStepRunId),
        service.from("llm_responses").update({
          status: "succeeded",
          response_payload: result.responseMetadata,
          input_tokens: result.inputTokens,
          output_tokens: result.outputTokens,
          http_status: result.httpStatus,
          completed_at: completedAt,
          duration_ms: result.durationMs,
        }).eq("id", currentResponseId),
      ]);
      assertNoDatabaseError(stepUpdate.error);
      assertNoDatabaseError(responseUpdate.error);

      previousOutput = result.text;
      currentStepRunId = null;
      currentStepStartedAt = null;
      currentResponseId = null;
      currentResponseStartedAt = null;
      send({
        type: "step_completed",
        stepOrder: step.step_order,
        name: step.name,
        output: result.text,
      });
    }

    const completedAt = new Date().toISOString();
    const durationMs = Math.max(0, Date.now() - runStartedAt);
    const [requestUpdate, chainUpdate] = await Promise.all([
      service.from("generation_requests").update({
        status: "succeeded",
        title: chain.name,
        content: previousOutput,
        completed_at: completedAt,
        duration_ms: durationMs,
      }).eq("id", requestId),
      service.from("prompt_chain_runs").update({
        status: "succeeded",
        completed_at: completedAt,
        duration_ms: durationMs,
      }).eq("id", chainRunId),
    ]);
    assertNoDatabaseError(requestUpdate.error);
    assertNoDatabaseError(chainUpdate.error);

    send({ type: "completed", requestId, finalOutput: previousOutput });
  } catch (error) {
    const errorInfo = safeRunError(error);
    if (activeIndex >= 0) {
      const now = new Date().toISOString();
      for (const skippedStep of steps.slice(activeIndex + 1)) {
        try {
          const prompts = renderStepPrompts(skippedStep, {
            input,
            situation: input,
            previous_output: previousOutput,
          });
          const { error: skippedError } = await service.from("prompt_chain_step_runs").insert({
            generation_request_id: requestId,
            chain_run_id: chainRunId,
            step_id: skippedStep.id,
            step_name_snapshot: skippedStep.name,
            step_order: skippedStep.step_order,
            attempt_no: 1,
            resolved_system_prompt: prompts.systemPrompt,
            resolved_user_prompt: prompts.userPrompt,
            input: { input, situation: input, previous_output: previousOutput },
            model_id: skippedStep.model.id,
            provider_name_snapshot: skippedStep.model.provider.name,
            model_key_snapshot: skippedStep.model.model_key,
            status: "skipped",
            started_at: now,
            completed_at: now,
            duration_ms: 0,
            error_code: "prior_step_failed",
            error_message: "A previous step failed, so this step was not run.",
          });
          assertNoDatabaseError(skippedError);
        } catch (skippedWriteError) {
          console.error("Could not save skipped prompt-chain step", {
            code: skippedWriteError instanceof DatabaseOperationError ? skippedWriteError.code : "unknown",
            requestId,
          });
        }
      }
    }

    try {
      await markRunFailed(
        service,
        requestId,
        chainRunId,
        runStartedAt,
        errorInfo,
        currentStepRunId,
        currentStepStartedAt,
        currentResponseId,
        currentResponseStartedAt,
      );
    } catch (failureWriteError) {
      console.error("Could not save prompt-chain failure state", {
        code: failureWriteError instanceof DatabaseOperationError ? failureWriteError.code : "unknown",
        requestId,
      });
      send({
        type: "error",
        requestId,
        message: "The run failed and its final status could not be saved. Contact an administrator.",
      });
      return;
    }

    send({ type: "error", requestId, message: errorInfo.message });
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await authenticateSuperadmin();
  if ("response" in auth) return auth.response;

  const origin = request.headers.get("origin");
  if (origin) {
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      return jsonResponse({ error: "This request origin is not allowed." }, 403);
    }
    const expectedHost = request.headers.get("x-forwarded-host")?.split(",")[0].trim()
      || request.headers.get("host");
    if (!expectedHost || originHost !== expectedHost) {
      return jsonResponse({ error: "This request origin is not allowed." }, 403);
    }
  }

  const { id: chainId } = await params;
  if (!UUID_PATTERN.test(chainId)) return jsonResponse({ error: "The prompt-chain identifier is invalid." }, 400);
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > 12_000) {
    return jsonResponse({ error: `Enter a prompt of up to ${MAX_INPUT_LENGTH} characters.` }, 413);
  }

  let requestBody: Awaited<ReturnType<typeof readBoundedJson>>;
  try {
    requestBody = await readBoundedJson(request);
  } catch {
    return jsonResponse({ error: "The request body could not be read. Try again." }, 400);
  }
  if (requestBody.kind === "too_large") {
    return jsonResponse({ error: `Enter a prompt of up to ${MAX_INPUT_LENGTH} characters.` }, 413);
  }
  if (requestBody.kind === "invalid") {
    return jsonResponse({ error: "Send valid JSON with an input and request key." }, 400);
  }

  const body = requestBody.body;

  const parsed = parseRequestBody(body);
  if (!parsed) return jsonResponse({
    error: `Enter text of 1 to ${MAX_INPUT_LENGTH} characters and use a valid request key.`,
  }, 400);

  let service: ReturnType<typeof createServiceRoleClient>;
  try {
    service = createServiceRoleClient();
  } catch {
    return jsonResponse({ error: "Server-side generation history is not configured." }, 503);
  }

  let duplicate: Response | null;
  try {
    duplicate = await getDuplicateResponse(
      service,
      auth.user.id,
      parsed.idempotencyKey,
      parsed.input,
      chainId,
    );
  } catch (error) {
    if (isMissingIdempotencyColumn(error instanceof DatabaseOperationError ? { code: error.code } : null)) {
      return jsonResponse({ error: "Apply the pending prompt-chain generation migration before running chains." }, 503);
    }
    return jsonResponse({ error: "Could not check generation history. Try again later." }, 503);
  }
  if (duplicate) return duplicate;

  const { data: chain, error: chainError } = await auth.supabase
    .from("prompt_chain_definitions")
    .select("id, name, is_active")
    .eq("id", chainId)
    .maybeSingle();
  if (chainError) return jsonResponse({ error: "Could not load this prompt chain." }, 503);
  if (!chain) return jsonResponse({ error: "This prompt chain was not found." }, 404);
  if (!chain.is_active) return jsonResponse({ error: "Activate this prompt chain before running it." }, 409);

  const { data: stepRows, error: stepError } = await auth.supabase
    .from("prompt_chain_steps")
    .select("id, step_order, name, system_prompt, user_prompt_template, settings, model:llm_models!inner(id, model_key, display_name, is_active, capabilities, provider:llm_providers!inner(name, api_base_url, is_active))")
    .eq("chain_id", chainId)
    .order("step_order", { ascending: true });
  if (stepError) return jsonResponse({ error: "Could not load the prompt-chain steps." }, 503);

  const steps = (stepRows ?? []) as unknown as StepConfiguration[];
  if (steps.length === 0) return jsonResponse({ error: "Add at least one step before running this chain." }, 409);
  if (steps.length > MAX_CHAIN_STEPS) {
    return jsonResponse({ error: `A chain can run at most ${MAX_CHAIN_STEPS} steps at a time.` }, 409);
  }

  try {
    steps.forEach((step) => {
      if (!isTextCapable(step)) throw new Error("An active text-capable model and provider are required for every step.");
      renderStepPrompts(step, {
        input: parsed.input,
        situation: parsed.input,
        previous_output: "Prior step output",
      });
    });
  } catch (error) {
    const detail = error instanceof Error && error.message.startsWith("Unsupported prompt variable:")
      ? error.message
      : "Every step must use an active text-capable model and valid prompt variables.";
    return jsonResponse({ error: detail }, 409);
  }

  const providerName = steps[0].model.provider.name;
  if (steps.some((step) => step.model.provider.name.trim().toLowerCase() !== providerName.trim().toLowerCase())) {
    return jsonResponse({ error: "All steps in this chain must use the same configured text provider." }, 409);
  }
  const apiKey = asProviderKey(providerName);
  if (!apiKey) return jsonResponse({ error: "Text generation is not configured on the server." }, 503);

  const startedAt = new Date().toISOString();
  const requestInsert = await service.from("generation_requests").insert({
    user_id: auth.user.id,
    situation: parsed.input,
    mix_id: null,
    mix_name_snapshot: `Standalone chain: ${chain.name}`,
    status: "running",
    started_at: startedAt,
    idempotency_key: parsed.idempotencyKey,
  }).select("id").single();

  if (requestInsert.error?.code === "23505") {
    try {
      const racedDuplicate = await getDuplicateResponse(
        service,
        auth.user.id,
        parsed.idempotencyKey,
        parsed.input,
        chainId,
      );
      if (racedDuplicate) return racedDuplicate;
    } catch {
      return jsonResponse({ error: "Could not retrieve the existing run. Try again with the same request key." }, 503);
    }
  } else if (requestInsert.error) {
    if (isMissingIdempotencyColumn(requestInsert.error)) {
      return jsonResponse({ error: "Apply the pending prompt-chain generation migration before running chains." }, 503);
    }
    return jsonResponse({ error: "Could not create generation history. Try again later." }, 503);
  }
  if (!requestInsert.data) return jsonResponse({ error: "Could not create generation history." }, 503);

  const chainRunInsert = await service.from("prompt_chain_runs").insert({
    generation_request_id: requestInsert.data.id,
    chain_id: chain.id,
    chain_name_snapshot: chain.name,
    status: "running",
    started_at: startedAt,
  }).select("id").single();
  if (chainRunInsert.error || !chainRunInsert.data) {
    const failure = safeRunError(new DatabaseOperationError(chainRunInsert.error?.code));
    try {
      const { error } = await service.from("generation_requests").update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_code: failure.code,
        error_message: failure.message,
      }).eq("id", requestInsert.data.id);
      assertNoDatabaseError(error);
    } catch {
      console.error("Could not save prompt-chain initialization failure", { requestId: requestInsert.data.id });
    }
    return jsonResponse({ error: failure.message }, 503);
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        await executeRun(
          service,
          requestInsert.data.id,
          chainRunInsert.data.id,
          { id: chain.id, name: chain.name },
          steps,
          parsed.input,
          apiKey,
          controller,
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0, must-revalidate",
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}
