"use client";

import { useRef, useState, type FormEvent } from "react";

type RunStep = {
  id: string;
  stepOrder: number;
  name: string;
  status: string;
  output: string | null;
  error?: string | null;
};

type RunState = "idle" | "connecting" | "running" | "succeeded" | "failed";

type RunEvent = {
  type: string;
  requestId?: string;
  chainName?: string;
  totalSteps?: number;
  stepOrder?: number;
  name?: string;
  output?: string;
  finalOutput?: string;
  message?: string;
};

type DuplicateRun = {
  requestId: string;
  status: "pending" | "running" | "succeeded" | "failed" | "interrupted";
  finalOutput: string | null;
  error: string | null;
  steps: RunStep[];
};

function isDuplicateRun(value: unknown): value is DuplicateRun {
  return typeof value === "object" && value !== null
    && "requestId" in value && typeof value.requestId === "string"
    && "status" in value && typeof value.status === "string"
    && "steps" in value && Array.isArray(value.steps);
}

function errorMessage(value: unknown) {
  return typeof value === "object" && value !== null && "error" in value && typeof value.error === "string"
    ? value.error
    : "The chain could not be run. Try again.";
}

export function RunChain({ chainId, isActive, stepCount }: {
  chainId: string;
  isActive: boolean;
  stepCount: number;
}) {
  const [input, setInput] = useState("");
  const [state, setState] = useState<RunState>("idle");
  const [steps, setSteps] = useState<RunStep[]>([]);
  const [activeStep, setActiveStep] = useState<{ order: number; name: string } | null>(null);
  const [finalOutput, setFinalOutput] = useState("");
  const [message, setMessage] = useState("");
  const [retryable, setRetryable] = useState(false);
  const requestKey = useRef<string | null>(null);
  const running = useRef(false);
  const isPending = state === "connecting" || state === "running";

  function resetRun() {
    requestKey.current = null;
    setSteps([]);
    setActiveStep(null);
    setFinalOutput("");
    setMessage("");
    setRetryable(false);
    setState("idle");
  }

  function applyDuplicateRun(result: DuplicateRun) {
    setSteps(result.steps);
    if (result.status === "succeeded") {
      setFinalOutput(result.finalOutput ?? "");
      setMessage("");
      setState("succeeded");
      setRetryable(false);
      requestKey.current = null;
      return true;
    }
    if (result.status === "failed" || result.status === "interrupted") {
      setMessage(result.error ?? "This run did not finish. Start a new run to try again.");
      setState("failed");
      setRetryable(false);
      requestKey.current = null;
      return true;
    }
    setState("running");
    setMessage("This request is already running. Checking for progress…");
    return false;
  }

  async function submitRun(idempotencyKey: string) {
    const response = await fetch(`/api/prompt-chains/${chainId}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: input.trim(), idempotencyKey }),
      cache: "no-store",
    });

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body: unknown = await response.json();
      if (!response.ok && response.status !== 202) throw new Error(errorMessage(body));
      if (!isDuplicateRun(body)) throw new Error("The run-status response was invalid.");
      return { kind: "duplicate" as const, body };
    }

    if (!response.ok || !response.body) {
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        // The server may have closed before returning a response body.
      }
      throw new Error(errorMessage(body));
    }
    return { kind: "stream" as const, response };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (running.current || !input.trim()) return;

    running.current = true;
    setState("connecting");
    setMessage("");
    setRetryable(false);
    setSteps([]);
    setFinalOutput("");
    setActiveStep(null);
    const idempotencyKey = requestKey.current ?? crypto.randomUUID();
    requestKey.current = idempotencyKey;

    try {
      let result = await submitRun(idempotencyKey);
      if (result.kind === "duplicate") {
        if (applyDuplicateRun(result.body)) return;
        for (let attempt = 0; attempt < 180; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 1_000));
          result = await submitRun(idempotencyKey);
          if (result.kind === "stream") {
            await consumeStream(result.response);
            return;
          }
          if (applyDuplicateRun(result.body)) return;
        }
        setMessage("The run is taking longer than expected. Retry to check its status.");
        setState("failed");
        setRetryable(true);
        return;
      }

      await consumeStream(result.response);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The connection was interrupted. Retry to check this run.");
      setState("failed");
      setRetryable(true);
    } finally {
      running.current = false;
    }
  }

  async function consumeStream(response: Response) {
    if (!response.body) throw new Error("The generation stream was unavailable.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let terminalEvent = false;

    const consumeLine = (line: string) => {
      if (!line.trim()) return;
      let event: RunEvent;
      try {
        event = JSON.parse(line) as RunEvent;
      } catch {
        throw new Error("The generation stream returned an invalid update.");
      }
      if (event.type === "started") {
        setState("running");
        setMessage("");
      } else if (event.type === "step_started" && typeof event.stepOrder === "number" && typeof event.name === "string") {
        setActiveStep({ order: event.stepOrder, name: event.name });
        setSteps((current) => {
          const existing = current.find((step) => step.stepOrder === event.stepOrder);
          const nextStep: RunStep = {
            id: existing?.id ?? String(event.stepOrder),
            stepOrder: event.stepOrder!,
            name: event.name!,
            status: "running",
            output: existing?.output ?? null,
          };
          return [...current.filter((step) => step.stepOrder !== event.stepOrder), nextStep]
            .sort((a, b) => a.stepOrder - b.stepOrder);
        });
      } else if (event.type === "step_completed" && typeof event.stepOrder === "number" && typeof event.name === "string") {
        setSteps((current) => {
          const nextStep: RunStep = {
            id: String(event.stepOrder),
            stepOrder: event.stepOrder!,
            name: event.name!,
            status: "succeeded",
            output: event.output ?? "",
          };
          return [...current.filter((step) => step.stepOrder !== event.stepOrder), nextStep]
            .sort((a, b) => a.stepOrder - b.stepOrder);
        });
        setActiveStep(null);
      } else if (event.type === "completed") {
        setFinalOutput(event.finalOutput ?? "");
        setMessage("");
        setState("succeeded");
        setRetryable(false);
        requestKey.current = null;
        terminalEvent = true;
      } else if (event.type === "error") {
        setMessage(event.message ?? "The prompt chain could not be completed.");
        setState("failed");
        setRetryable(false);
        requestKey.current = null;
        terminalEvent = true;
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) consumeLine(line);
    }
    buffer += decoder.decode();
    if (buffer.trim()) consumeLine(buffer);
    if (!terminalEvent) {
      throw new Error("The connection ended before the run finished. Retry to check the saved run.");
    }
  }

  function updateInput(value: string) {
    setInput(value);
    resetRun();
  }

  return (
    <section className="panel run-chain-panel" aria-labelledby="run-chain-heading">
      <div className="panel-heading">
        <div>
          <h2 id="run-chain-heading">Run chain</h2>
          <p className="muted">Each step passes its result to the next.</p>
        </div>
        <span className="count-pill">{stepCount} {stepCount === 1 ? "step" : "steps"}</span>
      </div>
      {!isActive && <p className="feedback feedback-blocked run-chain-notice" role="status">Activate this chain before running it.</p>}
      {stepCount === 0 && <p className="feedback feedback-blocked run-chain-notice" role="status">Add a step before running this chain.</p>}
      <form className="run-chain-form" onSubmit={handleSubmit}>
        <label className="field-label" htmlFor="run-chain-input">Your input</label>
        <textarea
          id="run-chain-input"
          className="text-input text-area run-chain-input"
          value={input}
          onChange={(event) => updateInput(event.target.value)}
          maxLength={5_000}
          rows={5}
          required
          disabled={isPending || !isActive || stepCount === 0}
          placeholder="Describe the text you want this chain to process…"
        />
        <div className="run-chain-input-footer">
          <span className="muted">Up to 5,000 characters</span>
          <span className="muted" aria-live="polite">{input.length}/5000</span>
        </div>
        <button className="button button-primary run-chain-button" type="submit" disabled={isPending || !input.trim() || !isActive || stepCount === 0}>
          {isPending && <span className="run-spinner" aria-hidden="true" />}
          {state === "connecting" ? "Starting…" : state === "running" ? "Running chain…" : "Run Chain"}
        </button>
      </form>

      {isPending && (
        <p className="run-chain-progress" role="status" aria-live="polite">
          {activeStep
            ? `Running step ${activeStep.order}: ${activeStep.name}…`
            : "Starting…"}
        </p>
      )}
      {message && <p className="feedback feedback-error run-chain-notice" role="alert">{message}</p>}

      {steps.length > 0 && (
        <ol className="run-chain-results" aria-label="Generated step outputs">
          {steps.map((step) => (
            <li className="run-chain-result" key={`${step.stepOrder}-${step.id}`}>
              <div className="run-chain-result-heading">
                <h3>Step {step.stepOrder}: {step.name}</h3>
                <span className={`run-step-status run-step-status-${step.status}`}>{step.status}</span>
              </div>
              {step.output
                ? <pre>{step.output}</pre>
                : step.status === "running" ? <p className="muted">Waiting for this step’s result…</p> : null}
            </li>
          ))}
        </ol>
      )}

      {state === "succeeded" && (
        <section className="run-chain-final" aria-labelledby="run-chain-final-heading">
          <h3 id="run-chain-final-heading">Final result</h3>
          <pre>{finalOutput}</pre>
        </section>
      )}
      {state === "failed" && !isPending && retryable && <p className="run-chain-retry-hint">Retry to check this run without generating a duplicate.</p>}
    </section>
  );
}
