import type { BranchId } from "@getops/contracts";

export interface LearningStage {
  id: string;
  label: string;
  title: string;
  description: string;
  branchIds: BranchId[];
}

export interface BranchLearningMeta {
  level: string;
  durationMinutes: number;
}

export const branchLearningMeta: Record<BranchId, BranchLearningMeta> = {
  market: { level: "Foundation", durationMinutes: 35 },
  sessions: { level: "Foundation", durationMinutes: 30 },
  feed: { level: "Core", durationMinutes: 45 },
  monitoring: { level: "Core", durationMinutes: 40 },
  orders: { level: "Advanced", durationMinutes: 45 },
  risk: { level: "Advanced", durationMinutes: 40 },
  capacity: { level: "HFT", durationMinutes: 45 },
  incident: { level: "HFT", durationMinutes: 50 },
  interview: { level: "Transfer", durationMinutes: 35 },
};

export const learningStages: LearningStage[] = [
  {
    id: "market-signal",
    label: "STAGE 1",
    title: "Read the market",
    description: "Establish market state and the first trustworthy source of truth.",
    branchIds: ["market", "sessions"],
  },
  {
    id: "data-truth",
    label: "STAGE 2",
    title: "Prove data truth",
    description: "Separate connectivity from continuity, freshness, and usable downstream state.",
    branchIds: ["feed", "monitoring"],
  },
  {
    id: "trading-control",
    label: "STAGE 3",
    title: "Control trading state",
    description: "Reconstruct order truth and determine whether risk controls remain authoritative.",
    branchIds: ["orders", "risk"],
  },
  {
    id: "operational-resilience",
    label: "STAGE 4",
    title: "Operate under pressure",
    description: "Protect headroom, contain impact, and preserve a decision-grade incident record.",
    branchIds: ["capacity", "incident"],
  },
  {
    id: "transfer",
    label: "STAGE 5",
    title: "Communicate the evidence",
    description: "Turn technical judgement into concise, credible next-round interview answers.",
    branchIds: ["interview"],
  },
];
