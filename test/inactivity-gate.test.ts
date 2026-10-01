import { afterEach, describe, expect, it } from "vitest";
import { selectCandidate } from "../src/03-select-candidates.js";
import { loadConfig } from "../src/support/config.js";
import type { RepositoryRef } from "../src/support/domain-types.js";
import type { GitHubClient } from "../src/support/github-client.js";

const ENV_KEYS = [
  "INACTIVITY_DAYS",
  "MAX_ASSESSMENTS",
  "MAX_GITHUB_REQUESTS",
  "AUDIT_MODE",
  "CURSOR_API_KEY",
  "CURSOR_MODEL",
  "GITHUB_TOKEN",
  "CREATE_TRACKING_ISSUE",
] as const;

const originalEnv = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));

const repository: RepositoryRef = {
  id: 1,
  owner: "josepalafox",
  name: "quiet-experiment",
  fullName: "josepalafox/quiet-experiment",
  htmlUrl: "https://github.com/josepalafox/quiet-experiment",
  defaultBranch: "main",
  createdAt: "2020-01-01T00:00:00Z",
  updatedAt: "2020-01-01T00:00:00Z",
  archived: false,
  fork: false,
  visibility: "public",
};

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function loadWith(values: Record<string, string>): ReturnType<typeof loadConfig> {
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, values);
  return loadConfig();
}

function clientWithLastActivity(occurredAt: string | null): GitHubClient {
  return {
    async getPrimaryContributor() {
      return "octocat";
    },
    async collectHumanActivity() {
      return {
        commitSha: "abc123",
        unavailableSources: [],
        events: occurredAt
          ? [{
              type: "commit" as const,
              actor: "octocat",
              occurredAt,
              url: "https://github.com/josepalafox/quiet-experiment/commit/abc123",
            }]
          : [],
      };
    },
  } as unknown as GitHubClient;
}

function occurredDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

describe("inactivity window", () => {
  it("defaults to 14 days", () => {
    expect(loadWith({}).inactivityDays).toBe(14);
  });

  it("passes a configured window through to the selection gate", async () => {
    const standard = loadWith({});
    const slower = loadWith({ INACTIVITY_DAYS: "30" });

    expect(slower.inactivityDays).toBe(30);
    expect(slower.maxAssessments).toBe(standard.maxAssessments);
    expect(slower.auditMode).toBe(standard.auditMode);
    expect(slower.owner).toBe(standard.owner);

    const client = clientWithLastActivity(occurredDaysAgo(20));
    const atDefault = await selectCandidate(client, repository, standard.inactivityDays);
    const atThirty = await selectCandidate(client, repository, slower.inactivityDays);

    expect(atDefault.selection.thresholdDays).toBe(14);
    expect(atDefault.selection.selected).toBe(true);
    expect(atThirty.selection.thresholdDays).toBe(30);
    expect(atThirty.selection.selected).toBe(false);
    expect(atThirty.commitSha).toBe("abc123");
  });

  it("still selects a repository when human activity is unknown", async () => {
    const config = loadWith({ INACTIVITY_DAYS: "30" });
    const result = await selectCandidate(clientWithLastActivity(null), repository, config.inactivityDays);

    expect(result.selection.thresholdDays).toBe(30);
    expect(result.selection.inactiveDays).toBeNull();
    expect(result.selection.selected).toBe(true);
  });

  it("rejects an inactivity window that is not a positive integer", () => {
    for (const value of ["0", "-5", "abc"]) {
      expect(() => loadWith({ INACTIVITY_DAYS: value })).toThrow(
        "INACTIVITY_DAYS must be a positive integer",
      );
    }
  });
});
