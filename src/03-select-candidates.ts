import { GitHubClient } from "./support/github-client.js";
import type { CandidateSelection, RepositoryRef } from "./support/domain-types.js";

// Step 03: Selects repositories after the inexpensive human-inactivity check.

// Callout: This inexpensive deterministic gate protects model cost.
export async function selectCandidate(
  client: GitHubClient,
  repository: RepositoryRef,
  thresholdDays: number,
): Promise<{ selection: CandidateSelection; commitSha: string }> {
  let primaryContributor: string | null = null;
  const unavailableSources: string[] = [];
  try {
    primaryContributor = await client.getPrimaryContributor(repository);
  } catch {
    unavailableSources.push("contributors");
  }

  const activity = await client.collectHumanActivity(repository, primaryContributor);
  unavailableSources.push(...activity.unavailableSources);
  const lastHumanActivity = activity.events.sort(
    (left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt),
  )[0] ?? null;
  const inactiveDays = lastHumanActivity
    ? Math.floor((Date.now() - Date.parse(lastHumanActivity.occurredAt)) / 86_400_000)
    : null;

  // Callout: Unknown human activity is selected for review instead of being treated as active.
  return {
    commitSha: activity.commitSha,
    selection: {
      thresholdDays,
      primaryContributor,
      lastHumanActivity,
      inactiveDays,
      selected: inactiveDays === null || inactiveDays >= thresholdDays,
      unavailableSources: [...new Set(unavailableSources)].sort(),
    },
  };
}
