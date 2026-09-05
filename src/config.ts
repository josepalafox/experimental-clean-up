const DEMO_OWNER = "josepalafox";

// Enterprise adaptation point: replace this fixed owner with an approved
// organization or enterprise repository source plus an explicit allowlist.
export const TARGET_OWNER = DEMO_OWNER;
export const UTILITY_REPOSITORY = "experimental-clean-up";

function integerFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

export interface Config {
  owner: string;
  utilityRepository: string;
  inactivityDays: number;
  maxAssessments: number;
  maxRequests: number;
  auditMode: "profile" | "assess";
  cursorApiKey?: string;
  cursorModel: string;
  githubReadToken?: string;
  githubWriteToken?: string;
  createTrackingIssue: boolean;
}

export function loadConfig(): Config {
  const auditMode = process.env.AUDIT_MODE === "assess" ? "assess" : "profile";
  const cursorApiKey = process.env.CURSOR_API_KEY;
  if (auditMode === "assess" && !cursorApiKey) {
    throw new Error("CURSOR_API_KEY is required when AUDIT_MODE=assess");
  }

  return {
    owner: TARGET_OWNER,
    utilityRepository: UTILITY_REPOSITORY,
    inactivityDays: integerFromEnv("INACTIVITY_DAYS", 14),
    maxAssessments: integerFromEnv("MAX_ASSESSMENTS", 10),
    maxRequests: integerFromEnv("MAX_GITHUB_REQUESTS", 500),
    auditMode,
    ...(cursorApiKey ? { cursorApiKey } : {}),
    cursorModel: process.env.CURSOR_MODEL ?? "auto",
    ...(process.env.GH_AUDIT_TOKEN
      ? { githubReadToken: process.env.GH_AUDIT_TOKEN }
      : process.env.GITHUB_TOKEN
        ? { githubReadToken: process.env.GITHUB_TOKEN }
        : {}),
    ...(process.env.GITHUB_TOKEN ? { githubWriteToken: process.env.GITHUB_TOKEN } : {}),
    createTrackingIssue: process.env.CREATE_TRACKING_ISSUE === "true",
  };
}
