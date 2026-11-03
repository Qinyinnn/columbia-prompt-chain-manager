export type ChainActionState = {
  status: "idle" | "success" | "error" | "blocked";
  message: string;
  fieldErrors?: { name?: string };
  dependencies?: { steps: number; mixMemberships: number; runs: number };
};

export const initialChainActionState: ChainActionState = {
  status: "idle",
  message: "",
};
