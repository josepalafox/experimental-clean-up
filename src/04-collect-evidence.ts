import { GitHubClient, evidenceForFile, fileSignals } from "./support/github-client.js";
import type {
  CandidateSelection,
  EvidenceItem,
  RepositoryProfile,
  RepositoryRef,
  Signal,
  SignalInventory,
} from "./support/domain-types.js";
import { SIGNALS } from "./support/domain-types.js";

// Step 04: Builds the complete evidence boundary before the agent starts.

const MAX_FILES_PER_SIGNAL = 8;
const MAX_FILE_BYTES = 100_000;

export async function buildRepositoryProfile(
  client: GitHubClient,
  repository: RepositoryRef,
  selection: CandidateSelection,
  commitSha: string,
): Promise<RepositoryProfile> {
  const tree = await client.getTree(repository, commitSha);
  const blobs = tree.tree.filter((item) => item.type === "blob");
  const pathsBySignal = new Map<Signal, string[]>(SIGNALS.map((signal) => [signal, []]));

  for (const item of blobs) {
    for (const signal of fileSignals(item.path)) {
      const paths = pathsBySignal.get(signal);
      if (paths && paths.length < MAX_FILES_PER_SIGNAL && (item.size ?? 0) <= MAX_FILE_BYTES) {
        paths.push(item.path);
      }
    }
  }

  const evidence: EvidenceItem[] = [];
  let nextEvidenceNumber = 1;
  const newId = (): string => `E-${String(nextEvidenceNumber++).padStart(3, "0")}`;
  if (selection.lastHumanActivity) {
    evidence.push({
      id: newId(),
      signal: "candidate_selection",
      sourceType: "activity",
      summary: `Last qualifying human activity: ${selection.lastHumanActivity.type} by ${selection.lastHumanActivity.actor} on ${selection.lastHumanActivity.occurredAt}`,
      reviewUrl: selection.lastHumanActivity.url,
    });
  }

  const inventoryEvidenceIds = new Map<Signal, string[]>();
  for (const signal of SIGNALS) {
    const paths = pathsBySignal.get(signal) ?? [];
    const ids: string[] = [];
    // Callout: A complete search with no matching file proves "absent" without model reasoning.
    if (paths.length === 0) {
      const id = newId();
      ids.push(id);
      evidence.push({
        id,
        signal,
        sourceType: "repository_tree",
        commitSha,
        summary: `${tree.truncated ? "Incomplete" : "Complete"} tree search found no files matching the ${signal} signal`,
        reviewUrl: `${repository.htmlUrl}/tree/${commitSha}`,
      });
    }
    inventoryEvidenceIds.set(signal, ids);
  }

  // Callout: Relevant contents are prefetched; the agent never fetches new GitHub data.
  const uniquePaths = [...new Set([...pathsBySignal.values()].flat())];
  const contents = new Map<string, string>();
  for (const path of uniquePaths) {
    contents.set(path, await client.getFile(repository, path, commitSha));
  }

  let workflowRuns: Awaited<ReturnType<GitHubClient["getWorkflowRuns"]>> = [];
  let workflowRunCollectionComplete = true;
  // Callout: CI evidence combines configuration files with observed workflow execution.
  if ((pathsBySignal.get("ci")?.length ?? 0) > 0) {
    try {
      workflowRuns = await client.getWorkflowRuns(repository);
    } catch {
      workflowRunCollectionComplete = false;
    }
  }

  for (const signal of SIGNALS) {
    for (const path of pathsBySignal.get(signal) ?? []) {
      const id = newId();
      inventoryEvidenceIds.get(signal)?.push(id);
      let content = contents.get(path) ?? "";
      if (signal === "ci") {
        const run = workflowRuns.find((item) => item.path === path || item.path.endsWith(path));
        content += run
          ? `\n\n[Observed workflow execution: ${run.status}; conclusion=${run.conclusion ?? "none"}; updated_at=${run.updated_at}; url=${run.html_url}]`
          : "\n\n[No workflow execution found in the retrieved run window.]";
      }
      evidence.push(evidenceForFile(repository, signal, path, commitSha, content, id));
    }
  }

  // Callout: Incomplete collection remains explicit and becomes "unclear" during validation.
  const signalInventory: SignalInventory[] = SIGNALS.map((signal) => {
    const matchedPaths = pathsBySignal.get(signal) ?? [];
    const searchComplete = !tree.truncated && (signal !== "ci" || workflowRunCollectionComplete);
    return {
      signal,
      searchStatus: searchComplete ? "complete" : "incomplete",
      matchedPaths,
      deterministicState: searchComplete && matchedPaths.length === 0 ? "absent" : null,
      evidenceIds: inventoryEvidenceIds.get(signal) ?? [],
    };
  });

  return {
    repository,
    commitSha,
    collectedAt: new Date().toISOString(),
    candidateSelection: selection,
    signalInventory,
    evidence,
    requestCount: client.requestCount,
  };
}
