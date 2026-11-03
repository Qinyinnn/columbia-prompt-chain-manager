export type StepActionState = {
  status: "idle" | "success" | "error";
  message: string;
  fieldErrors?: {
    name?: string;
    system_prompt?: string;
    user_prompt_template?: string;
    model_id?: string;
    settings?: string;
  };
};

export const initialStepActionState: StepActionState = { status: "idle", message: "" };
