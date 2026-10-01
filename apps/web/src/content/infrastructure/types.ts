import type { InfraLessonId } from "@getops/contracts";

export interface InfraConcept {
  title: string;
  body: string;
  operational: string;
}

export interface CommandLab {
  command: string;
  output: string;
  interpretation: string;
  boundary: string;
}

export interface InfraQuestion {
  id: string;
  prompt: string;
  evidence?: string;
  options: { label: string; reason: string }[];
  answer: number;
  takeaway: string;
}

export interface InfraLesson {
  id: InfraLessonId;
  title: string;
  subtitle: string;
  stage: "Ingress" | "Execution" | "System" | "Synthesis";
  minutes: number;
  prerequisite: InfraLessonId | null;
  connectsTo: "feed" | "capacity" | "monitoring" | "incident";
  objectives: string[];
  concepts: InfraConcept[];
  commands: CommandLab[];
  questions: InfraQuestion[];
  interview: { prompt: string; answer: string };
  sources: { label: string; url: string }[];
}
