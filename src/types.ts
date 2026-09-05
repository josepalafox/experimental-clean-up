export const SIGNALS = [
  "prompts",
  "skill_or_spec",
  "ci",
  "ownership",
  "onboarding",
] as const;

export type Signal = (typeof SIGNALS)[number];
export const SIGNAL_STATES = ["substantive", "weak", "absent", "unclear"] as const;
export type SignalState = (typeof SIGNAL_STATES)[number];

export type Category =
  | "review_for_retirement"
  | "further_investigation"
  | "not_surfaced";

export interface RepositoryRef {
  id: number;
  owner: string;
  name: string;
  fullName: string;
  htmlUrl: string;
  defaultBranch: string;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  fork: boolean;
  visibility: "public";
}

export type ActivityType =
  | "commit"
  | "release"
  | "issue_opened"
  | "issue_comment"
  | "security_issue_closed";

export interface ActivityEvent {
  type: ActivityType;
  actor: string;
  occurredAt: string;
  url: string;
}

export interface CandidateSelection {
  thresholdDays: number;
  primaryContributor: string | null;
  lastHumanActivity: ActivityEvent | null;
  inactiveDays: number | null;
  selected: boolean;
  unavailableSources: string[];
}

export interface EvidenceItem {
  id: string;
  signal: Signal | "candidate_selection" | "context";
  sourceType: "file" | "repository_tree" | "workflow_run" | "activity";
  path?: string;
  commitSha?: string;
  content?: string;
  summary: string;
  reviewUrl: string;
}

export interface SignalInventory {
  signal: Signal;
  searchStatus: "complete" | "incomplete";
  matchedPaths: string[];
  deterministicState: "absent" | null;
  evidenceIds: string[];
}

export interface RepositoryProfile {
  repository: RepositoryRef;
  commitSha: string;
  collectedAt: string;
  candidateSelection: CandidateSelection;
  signalInventory: SignalInventory[];
  evidence: EvidenceItem[];
  requestCount: number;
}

export interface SignalAssessment {
  signal: Signal;
  state: SignalState;
  evidence_ids: string[];
  explanation: string;
}

export interface ModelAssessment {
  signal_assessments: SignalAssessment[];
}

export interface FinalSignal extends SignalAssessment {
  decided_by: "profiler" | "model" | "validation_override";
}

export interface FinalResult {
  repository: RepositoryRef;
  commitSha: string;
  collectedAt: string;
  inactiveDays: number | null;
  lastHumanActivity: ActivityEvent | null;
  signals: FinalSignal[];
  weakOrAbsentCount: number;
  category: Category;
  reasonCodes: string[];
  validationStatus: "valid" | "invalid";
  evidence: EvidenceItem[];
  assessmentAttempts: number;
}

export interface AuditSummary {
  generatedAt: string;
  owner: string;
  repositoriesEnumerated: number;
  candidatesSelected: number;
  candidatesAssessed: number;
  candidatesDeferred: number;
  mode: "profile" | "assess";
  results: FinalResult[];
  profiles: RepositoryProfile[];
  errors: Array<{ repository: string; error: string }>;
}
