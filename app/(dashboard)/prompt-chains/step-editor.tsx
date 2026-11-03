"use client";

import { useActionState, useEffect, useMemo, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deletePromptChainStep, reorderPromptChainSteps, savePromptChainStep } from "./step-actions";
import { initialStepActionState } from "./step-state";

export type ChainStep = {
  id: string;
  chain_id: string;
  step_order: number;
  name: string;
  system_prompt: string;
  user_prompt_template: string;
  model_id: string;
  settings: Record<string, unknown>;
};

export type TextModel = {
  id: string;
  model_key: string;
  display_name: string;
  capabilities: Record<string, unknown>;
  provider: { name: string; is_active: boolean };
};

function StepForm({ chainId, models, step, onClose, onSuccess }: {
  chainId: string;
  models: TextModel[];
  step?: ChainStep;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [state, action, pending] = useActionState(savePromptChainStep, initialStepActionState);
  useEffect(() => {
    if (state.status === "success") onSuccess(state.message);
  }, [state.status, state.message, onSuccess]);

  return <form action={action} className="chain-form step-form">
    <input type="hidden" name="chain_id" value={chainId} />
    {step && <input type="hidden" name="step_id" value={step.id} />}
    <label className="field-label" htmlFor="step-name">Step name</label>
    <input id="step-name" className="text-input" name="name" defaultValue={step?.name ?? ""} required autoFocus aria-invalid={Boolean(state.fieldErrors?.name)} />
    {state.fieldErrors?.name && <p className="field-error">{state.fieldErrors.name}</p>}

    <label className="field-label" htmlFor="step-system-prompt">System prompt</label>
    <textarea id="step-system-prompt" className="text-input text-area prompt-area" name="system_prompt" defaultValue={step?.system_prompt ?? ""} rows={5} required aria-invalid={Boolean(state.fieldErrors?.system_prompt)} />
    {state.fieldErrors?.system_prompt && <p className="field-error">{state.fieldErrors.system_prompt}</p>}

    <label className="field-label" htmlFor="step-user-prompt">User prompt template</label>
    <textarea id="step-user-prompt" className="text-input text-area prompt-area" name="user_prompt_template" defaultValue={step?.user_prompt_template ?? ""} rows={5} required aria-invalid={Boolean(state.fieldErrors?.user_prompt_template)} />
    {state.fieldErrors?.user_prompt_template && <p className="field-error">{state.fieldErrors.user_prompt_template}</p>}

    <label className="field-label" htmlFor="step-model">Text model</label>
    <select id="step-model" className="text-input" name="model_id" defaultValue={step?.model_id ?? ""} required aria-invalid={Boolean(state.fieldErrors?.model_id)}>
      <option value="" disabled>Select a model</option>
      {models.map((model) => <option value={model.id} key={model.id}>{model.display_name} · {model.provider.name}</option>)}
    </select>
    {state.fieldErrors?.model_id && <p className="field-error">{state.fieldErrors.model_id}</p>}

    <label className="field-label" htmlFor="step-settings">Settings <span className="muted">JSON object</span></label>
    <textarea id="step-settings" className="text-input text-area settings-area" name="settings" defaultValue={JSON.stringify(step?.settings ?? {}, null, 2)} rows={5} spellCheck={false} aria-invalid={Boolean(state.fieldErrors?.settings)} />
    {state.fieldErrors?.settings && <p className="field-error">{state.fieldErrors.settings}</p>}
    {state.message && state.status !== "success" && <p className="feedback feedback-error" role="alert">{state.message}</p>}
    <div className="dialog-actions"><button type="button" className="button button-secondary" onClick={onClose} disabled={pending}>Cancel</button><button type="submit" className="button button-primary" disabled={pending || models.length === 0}>{pending ? "Saving…" : step ? "Save step" : "Create step"}</button></div>
  </form>;
}

function DeleteStepForm({ chainId, step, onClose, onSuccess }: {
  chainId: string;
  step: ChainStep;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [state, action, pending] = useActionState(deletePromptChainStep, initialStepActionState);
  useEffect(() => {
    if (state.status === "success") onSuccess(state.message);
  }, [state.status, state.message, onSuccess]);
  return <form action={action}>
    <input type="hidden" name="chain_id" value={chainId} /><input type="hidden" name="step_id" value={step.id} />
    <p className="dialog-description">Delete <strong>{step.name}</strong>? Steps with run history can’t be deleted.</p>
    {state.message && <p className="feedback feedback-error" role="alert">{state.message}</p>}
    <div className="dialog-actions"><button type="button" className="button button-secondary" onClick={onClose} disabled={pending}>Cancel</button><button type="submit" className="button button-danger" disabled={pending}>{pending ? "Deleting…" : "Delete step"}</button></div>
  </form>;
}

export function StepEditor({ chainId, steps: initialSteps, models }: { chainId: string; steps: ChainStep[]; models: TextModel[] }) {
  const router = useRouter();
  const [steps, setSteps] = useOptimistic(initialSteps);
  const [modal, setModal] = useState<"create" | { edit: ChainStep } | { delete: ChainStep } | null>(null);
  const [notice, setNotice] = useState("");
  const [noticeStatus, setNoticeStatus] = useState<"success" | "error">("success");
  const [dragId, setDragId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const closeModal = useMemo(() => () => setModal(null), []);
  const onSuccess = useMemo(() => (message: string) => { setNotice(message); setNoticeStatus("success"); setModal(null); }, []);

  function moveStep(fromId: string, toId: string) {
    if (isPending || fromId === toId) return;
    const from = steps.findIndex((step) => step.id === fromId);
    const to = steps.findIndex((step) => step.id === toId);
    if (from < 0 || to < 0) return;
    const expected = steps.map((step) => step.id);
    const next = [...steps];
    const [moving] = next.splice(from, 1);
    next.splice(to, 0, moving);
    setNotice("");
    startTransition(async () => {
      setSteps(next);
      const result = await reorderPromptChainSteps(chainId, expected, next.map((step) => step.id));
      setNotice(result.message);
      setNoticeStatus(result.status === "success" ? "success" : "error");
      router.refresh();
    });
  }

  return <section className="panel detail-panel step-editor-panel" aria-label="Prompt chain steps">
    <div className="panel-heading"><div><h2>Steps</h2><p className="muted">Drag to reorder. Each step passes its output forward.</p></div><div className="step-panel-actions"><span className="count-pill">{steps.length} {steps.length === 1 ? "step" : "steps"}</span><button className="button button-primary" type="button" onClick={() => setModal("create")} disabled={models.length === 0}><span aria-hidden="true">＋</span> Add step</button></div></div>
    {notice && <div className={`feedback feedback-${noticeStatus === "error" ? "error" : "success"} chain-notice`} role={noticeStatus === "error" ? "alert" : "status"}>{notice}<button type="button" className="notice-close" onClick={() => setNotice("")} aria-label="Dismiss message">×</button></div>}
    {steps.length ? <ol className={`detail-step-list editable-step-list ${isPending ? "is-pending" : ""}`} aria-label="Steps in run order">
      {steps.map((step, index) => {
        const model = models.find((candidate) => candidate.id === step.model_id);
        return <li className="editable-step" key={step.id} draggable={!isPending} onDragStart={(event) => { setDragId(step.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", step.id); }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const source = event.dataTransfer.getData("text/plain") || dragId; if (source) moveStep(source, step.id); setDragId(null); }} onDragEnd={() => setDragId(null)}>
          <span className="step-number" aria-hidden="true">{index + 1}</span>
          <span className="drag-handle" aria-hidden="true" title="Drag to reorder">⠿</span>
          <span className="editable-step-copy"><strong>{step.name}</strong><small>{model ? `${model.display_name} · ${model.provider.name}` : "Current model is not marked as active text-capable"}</small></span>
          <div className="step-row-actions">
            <button type="button" className="icon-button" onClick={() => moveStep(step.id, steps[index - 1]?.id ?? step.id)} disabled={index === 0 || isPending} aria-label={`Move ${step.name} up`} title="Move up">↑</button>
            <button type="button" className="icon-button" onClick={() => moveStep(step.id, steps[index + 1]?.id ?? step.id)} disabled={index === steps.length - 1 || isPending} aria-label={`Move ${step.name} down`} title="Move down">↓</button>
            <button type="button" className="button button-secondary" onClick={() => setModal({ edit: step })} disabled={models.length === 0}>Edit</button>
            <button type="button" className="icon-button danger-text" onClick={() => setModal({ delete: step })} aria-label={`Delete ${step.name}`} title="Delete step">×</button>
          </div>
        </li>;
      })}
    </ol> : <div className="detail-empty"><span className="empty-icon">⌘</span><h2>No steps yet</h2><p className="muted">Add the first step to define this chain’s workflow.</p></div>}
    {isPending && <p className="muted reorder-pending" role="status">Saving step order…</p>}

    {modal && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}><section className="dialog panel step-dialog" role="dialog" aria-modal="true" aria-labelledby="step-dialog-title">
      <div className="dialog-heading"><div><p className="eyebrow">{modal === "create" ? "NEW STEP" : "STEP SETTINGS"}</p><h2 id="step-dialog-title">{modal === "create" ? "Add a step" : "edit" in modal ? "Edit step" : "Delete step"}</h2></div><button className="icon-button" type="button" onClick={closeModal} aria-label="Close dialog">×</button></div>
      {modal === "create" ? <StepForm chainId={chainId} models={models} onClose={closeModal} onSuccess={onSuccess} /> : "edit" in modal ? <StepForm chainId={chainId} step={modal.edit} models={models} onClose={closeModal} onSuccess={onSuccess} /> : <DeleteStepForm chainId={chainId} step={modal.delete} onClose={closeModal} onSuccess={onSuccess} />}
    </section></div>}
  </section>;
}
