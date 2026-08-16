export interface Improvement {
  problem: string;
  suggestion: string;
  impact: string;
}

export interface FlowStep {
  step: number | string;
  actor: string;
  action: string;
}

export interface Screen {
  name: string;
  description: string;
}

export type PocItem = string | { name?: string; label?: string; value?: string; status?: string };

export interface PocBlock {
  type: "header" | "heading" | "text" | "list" | "stats" | "form" | "button" | "card" | "status" | string;
  label?: string;
  meta?: string;
  items?: PocItem[];
}

export interface PocScreen {
  name: string;
  nav?: string[];
  blocks: PocBlock[];
}

export interface Analysis {
  summary: string;
  business_goal: string;
  current_process: string[];
  pain_points: string[];
  requirements: string[];
  missing_information: string[];
  improvements: Improvement[];
  solution: {
    name: string;
    description: string;
    features: string[];
    roles: string[];
    screens: Screen[];
    flow: FlowStep[];
  };
  poc: {
    app_name: string;
    screens: PocScreen[];
  };
}

export type InputKind = "file" | "text" | "url";

export interface ClientInput {
  id: string;
  kind: InputKind;
  name: string;
  contentType: string;
  content?: string;
  file?: File;
  size: number;
}

export interface AnalysisResult {
  model: string;
  inputs: { name: string; type: string; chars: number }[];
  analysis: Analysis;
}
