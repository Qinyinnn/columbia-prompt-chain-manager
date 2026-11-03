import "server-only";

export type PromptValues = {
  input: string;
  situation: string;
  previous_output: string;
};

export type ProviderConfiguration = {
  name: string;
  api_base_url: string;
};

export type StepConfiguration = {
  id: string;
  step_order: number;
  name: string;
  system_prompt: string;
  user_prompt_template: string;
  settings: Record<string, unknown>;
  model: {
    id: string;
    model_key: string;
    display_name: string;
    is_active: boolean;
    capabilities: Record<string, unknown>;
    provider: ProviderConfiguration & { is_active: boolean };
  };
};

export type ResolvedStepPrompts = {
  systemPrompt: string;
  userPrompt: string;
};

export type ProviderResult = {
  text: string;
  httpStatus: number;
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  responseMetadata: Record<string, unknown>;
};

export class ProviderCallError extends Error {
  readonly code: string;
  readonly responseStatus: number | null;
  readonly responseState: "failed" | "timed_out" | "rate_limited";

  constructor(
    message: string,
    code: string,
    responseState: "failed" | "timed_out" | "rate_limited" = "failed",
    responseStatus: number | null = null,
  ) {
    super(message);
    this.name = "ProviderCallError";
    this.code = code;
    this.responseState = responseState;
    this.responseStatus = responseStatus;
  }
}

const MAX_OUTPUT_LENGTH = 50_000;
const MAX_PROVIDER_RESPONSE_LENGTH = 1_000_000;
const PROVIDER_TIMEOUT_MS = 30_000;

function templateValues(values: PromptValues): Record<string, string> {
  return {
    input: values.input,
    situation: values.situation,
    previous_output: values.previous_output,
  };
}

export function validateTemplate(template: string) {
  for (const match of template.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) {
    const key = match[1].trim();
    if (key !== "input" && key !== "situation" && key !== "previous_output") {
      throw new Error(`Unsupported prompt variable: ${key}`);
    }
  }
}

function renderTemplate(template: string, values: PromptValues) {
  validateTemplate(template);
  const resolved = template.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_match, rawKey: string) => {
    const key = rawKey.trim();
    const value = templateValues(values)[key];
    if (value === undefined) throw new Error(`Unsupported prompt variable: ${key}`);
    return value;
  });
  if (/\{\{[^{}]*\}\}/.test(resolved)) {
    throw new Error("Prompt contains an unresolved template variable.");
  }
  return resolved.trim();
}

export function renderStepPrompts(
  step: StepConfiguration,
  values: PromptValues,
): ResolvedStepPrompts {
  const userPrompt = renderTemplate(step.user_prompt_template, values);
  const systemPrompt = renderTemplate(step.system_prompt, values);

  if (!systemPrompt || !userPrompt) {
    throw new Error("A prompt step resolved to an empty prompt.");
  }

  return { systemPrompt, userPrompt };
}

function providerEndpoint(provider: ProviderConfiguration) {
  if (provider.name.trim().toLowerCase() !== "deepseek") {
    throw new ProviderCallError(
      "This provider is not supported by the configured server adapter.",
      "unsupported_provider",
    );
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(provider.api_base_url);
  } catch {
    throw new ProviderCallError("The provider endpoint is invalid.", "invalid_provider_endpoint");
  }

  if (
    baseUrl.protocol !== "https:" ||
    baseUrl.hostname !== "api.deepseek.com" ||
    (baseUrl.port && baseUrl.port !== "443") ||
    baseUrl.username ||
    baseUrl.password ||
    baseUrl.search ||
    baseUrl.hash
  ) {
    throw new ProviderCallError("The provider endpoint is not allowed.", "invalid_provider_endpoint");
  }

  if (!baseUrl.pathname.endsWith("/")) baseUrl.pathname += "/";
  return new URL("chat/completions", baseUrl);
}

function settingsForRequest(settings: Record<string, unknown>) {
  const result: Record<string, number> = {};
  const temperature = settings.temperature;
  const topP = settings.top_p;
  const maxTokens = settings.max_tokens;

  if (typeof temperature === "number" && Number.isFinite(temperature) && temperature >= 0 && temperature <= 2) {
    result.temperature = temperature;
  }
  if (typeof topP === "number" && Number.isFinite(topP) && topP > 0 && topP <= 1) {
    result.top_p = topP;
  }
  if (typeof maxTokens === "number" && Number.isInteger(maxTokens) && maxTokens > 0 && maxTokens <= 8192) {
    result.max_tokens = maxTokens;
  }

  return result;
}

function tokenCount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

export async function generateStepText(
  step: StepConfiguration,
  prompts: ResolvedStepPrompts,
  apiKey: string,
): Promise<ProviderResult> {
  const endpoint = providerEndpoint(step.model.provider);
  const startedAt = Date.now();
  let response: Response;

  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: step.model.model_key,
        messages: [
          { role: "system", content: prompts.systemPrompt },
          { role: "user", content: prompts.userPrompt },
        ],
        stream: false,
        ...settingsForRequest(step.settings),
      }),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new ProviderCallError(
        "The text provider timed out. Retry the chain.",
        "provider_timeout",
        "timed_out",
      );
    }
    throw new ProviderCallError(
      "The text provider could not be reached. Retry the chain.",
      "provider_unreachable",
    );
  }

  if (!response.ok) {
    if (response.status === 429) {
      throw new ProviderCallError(
        "The text provider is rate-limiting requests. Try again later.",
        "provider_rate_limited",
        "rate_limited",
        response.status,
      );
    }
    if (response.status === 402) {
      throw new ProviderCallError(
        "The text provider account needs attention. Contact an administrator.",
        "provider_account_unavailable",
        "failed",
        response.status,
      );
    }
    throw new ProviderCallError(
      "The text provider could not complete this step.",
      `provider_http_${response.status}`,
      "failed",
      response.status,
    );
  }

  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_PROVIDER_RESPONSE_LENGTH) {
    throw new ProviderCallError("The provider response was too large.", "provider_response_too_large", "failed", response.status);
  }

  let rawResponse: string;
  try {
    rawResponse = await response.text();
  } catch {
    throw new ProviderCallError("The provider response could not be read.", "provider_invalid_response", "failed", response.status);
  }
  if (rawResponse.length > MAX_PROVIDER_RESPONSE_LENGTH) {
    throw new ProviderCallError("The provider response was too large.", "provider_response_too_large", "failed", response.status);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawResponse);
  } catch {
    throw new ProviderCallError("The provider returned an invalid response.", "provider_invalid_response", "failed", response.status);
  }

  const choices = typeof payload === "object" && payload !== null && "choices" in payload
    ? payload.choices
    : null;
  const firstChoice = Array.isArray(choices) ? choices[0] : null;
  const message = typeof firstChoice === "object" && firstChoice !== null && "message" in firstChoice
    ? firstChoice.message
    : null;
  const text = typeof message === "object" && message !== null && "content" in message
    && typeof message.content === "string"
    ? message.content.trim()
    : "";

  if (!text) {
    throw new ProviderCallError("The provider returned no text for this step.", "provider_empty_output", "failed", response.status);
  }
  if (text.length > MAX_OUTPUT_LENGTH) {
    throw new ProviderCallError("The provider output exceeded the allowed size.", "provider_output_too_large", "failed", response.status);
  }

  const usage = typeof payload === "object" && payload !== null && "usage" in payload
    && typeof payload.usage === "object" && payload.usage !== null
    ? payload.usage
    : null;
  const inputTokens = usage && "prompt_tokens" in usage ? tokenCount(usage.prompt_tokens) : null;
  const outputTokens = usage && "completion_tokens" in usage ? tokenCount(usage.completion_tokens) : null;

  return {
    text,
    httpStatus: response.status,
    durationMs: Date.now() - startedAt,
    inputTokens,
    outputTokens,
    responseMetadata: {
      choice_count: Array.isArray(choices) ? choices.length : 0,
      finish_reason: typeof firstChoice === "object" && firstChoice !== null
        && "finish_reason" in firstChoice && typeof firstChoice.finish_reason === "string"
        ? firstChoice.finish_reason.slice(0, 40)
        : null,
    },
  };
}
