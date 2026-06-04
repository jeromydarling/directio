export type JourneyStage = {
  key: string;
  label: string;
  state: "done" | "active" | "pending";
  detail?: string | null;
};
