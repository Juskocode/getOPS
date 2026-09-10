import {
  Activity,
  BookOpen,
  FlaskConical,
  GraduationCap,
  Layers3,
  RadioTower,
  Siren,
  type LucideIcon,
} from "lucide-react";

import { flashcards } from "../content/catalog";
import { branchById, branches } from "../domain/branches";
import { scenarioBriefings } from "../domain/scenario-briefings";

export type CommandKind = "destination" | "guide" | "recall" | "scenario";

export interface WorkspaceCommand {
  id: string;
  kind: CommandKind;
  label: string;
  meta: string;
  to: string;
  icon: LucideIcon;
  color?: string | undefined;
  searchText: string;
}

const destinationCommands: WorkspaceCommand[] = [
  {
    id: "destination-today",
    kind: "destination",
    label: "Operator command center",
    meta: "Today",
    to: "/",
    icon: Activity,
    searchText: "today dashboard daily mission operator command center",
  },
  {
    id: "destination-learn",
    kind: "destination",
    label: "Operational knowledge path",
    meta: "Learn",
    to: "/learn",
    icon: BookOpen,
    searchText: "learn roadmap path guides curriculum operational knowledge",
  },
  {
    id: "destination-practice",
    kind: "destination",
    label: "Written recall deck",
    meta: "Practice",
    to: "/practice/flashcards",
    icon: Layers3,
    searchText: "practice flashcards recall questions answer validate",
  },
  {
    id: "destination-simulate",
    kind: "destination",
    label: "Scenario desk",
    meta: "Simulate",
    to: "/simulate",
    icon: RadioTower,
    searchText: "simulate incidents pressure scenarios telemetry escalation",
  },
  {
    id: "destination-profile",
    kind: "destination",
    label: "Operator progress",
    meta: "Progress",
    to: "/profile",
    icon: GraduationCap,
    searchText: "profile progress rank xp evidence coverage operator",
  },
  {
    id: "destination-galton",
    kind: "destination",
    label: "Galton probability field",
    meta: "Stochastic lab",
    to: "/lab/galton",
    icon: FlaskConical,
    color: "#f1ca61",
    searchText: "galton board probability distribution binomial balls stochastic simulation lab equation",
  },
];

const guideCommands: WorkspaceCommand[] = branches.map((branch) => ({
  id: `guide-${branch.id}`,
  kind: "guide",
  label: branch.name,
  meta: "Deep dive guide",
  to: `/learn/${branch.id}`,
  icon: branch.icon,
  color: branch.color,
  searchText: `${branch.name} ${branch.shortName} ${branch.description} guide deep dive`,
}));

const recallCommands: WorkspaceCommand[] = flashcards.map((card) => {
  const branch = branchById.get(card.branch);
  return {
    id: `recall-${card.id}`,
    kind: "recall",
    label: card.prompt,
    meta: `${branch?.shortName ?? card.branch} recall`,
    to: `/practice/flashcards?branch=${card.branch}&card=${card.id}`,
    icon: Layers3,
    color: branch?.color,
    searchText: `${card.prompt} ${card.answer} ${card.deepDive} ${branch?.name ?? card.branch}`,
  };
});

const scenarioCommands: WorkspaceCommand[] = scenarioBriefings.map((scenario) => {
  const branch = branchById.get(scenario.branchId);
  return {
    id: `scenario-${scenario.id}`,
    kind: "scenario",
    label: scenario.title,
    meta: `${scenario.severity} scenario`,
    to: `/simulate?scenario=${scenario.id}`,
    icon: Siren,
    color: branch?.color,
    searchText: `${scenario.title} ${scenario.symptom} ${scenario.decision} ${scenario.severity} ${branch?.name ?? scenario.branchId}`,
  };
});

export const workspaceCommands = [
  ...destinationCommands,
  ...guideCommands,
  ...recallCommands,
  ...scenarioCommands,
];

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function commandScore(command: WorkspaceCommand, query: string, tokens: string[]): number {
  const label = normalize(command.label);
  const meta = normalize(command.meta);
  const haystack = normalize(`${command.searchText} ${command.meta}`);
  if (!tokens.every((token) => haystack.includes(token))) return Number.POSITIVE_INFINITY;
  if (label === query) return 0;
  if (label.startsWith(query)) return 5;
  if (label.includes(query)) return 10;
  if (tokens.every((token) => label.includes(token))) return 15;
  if (meta.includes(query)) return 20;
  return 30 + (command.kind === "recall" ? 2 : 0);
}

export function searchWorkspaceCommands(query: string, limit = 10): WorkspaceCommand[] {
  const normalized = normalize(query);
  if (!normalized) return [...destinationCommands, ...guideCommands.slice(0, 4)].slice(0, limit);
  const tokens = normalized.split(" ").filter(Boolean);
  return workspaceCommands
    .map((command) => ({ command, score: commandScore(command, normalized, tokens) }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((left, right) => left.score - right.score || left.command.label.localeCompare(right.command.label))
    .slice(0, limit)
    .map((entry) => entry.command);
}
