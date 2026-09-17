import { GitHubClient, evidenceForFile, fileSignals, selectCiWorkflowPaths } from "./support/github-client.js";
import type {
  CandidateSelection,
  EvidenceItem,
  RepositoryProfile,
  RepositoryRef,
  Signal,
  SignalInventory,
} from "./support/domain-types.js";
import { SIGNALS } from "./support/domain-types.js";

// Step 04: Collects the local evidence bundle and records search coverage before assessment.

export const MAX_FILES_PER_SIGNAL = 8;
export const MAX_FILE_BYTES = 100_000;

function isRepositoryReadme(path: string): boolean {
  return path.toLowerCase() === "readme.md";
}

const ABSENCE_SEARCHES: Record<Signal, string> = {
  prompts: ".github/prompts/**",
  skill_or_spec: ".github/{skills,agents,instructions}/** and named specification files",
  ci: "repository-specific .github/workflows files (excluding CodeQL, Dependabot, and similar templates)",
  ownership: "CODEOWNERS, README.md, or SECURITY.md",
  onboarding: "README.md or repository-level setup and install files",
};

function absenceReviewUrl(repository: RepositoryRef, commitSha: string, signal: Signal, hasGitHubDirectory: boolean): string {
  const usesGitHubDirectory = ["prompts", "skill_or_spec", "ci"].includes(signal);
  return usesGitHubDirectory && hasGitHubDirectory
    ? `${repository.htmlUrl}/tree/${commitSha}/.github`
    : `${repository.htmlUrl}/tree/${commitSha}`;
}

export function collectSignalPaths(blobs: Array<{ path: string; size?: number }>): {
  pathsBySignal: Map<Signal, string[]>;
  skippedBySignal: Set<Signal>;
} {
  const pathsBySignal = new Map<Signal, string[]>(SIGNALS.map((signal) => [signal, []]));
  const skippedBySignal = new Set<Signal>();
  const ciCandidates: string[] = [];

  for (const item of blobs) {
    for (const signal of fileSignals(item.path)) {
      if (signal === "ci") {
        if ((item.size ?? 0) > MAX_FILE_BYTES) continue;
        ciCandidates.push(item.path);
        continue;
      }
      const paths = pathsBySignal.get(signal);
      if (!paths) continue;
      const oversized = (item.size ?? 0) > MAX_FILE_BYTES && !isRepositoryReadme(item.path);
      if (oversized || paths.length >= MAX_FILES_PER_SIGNAL) {
        skippedBySignal.add(signal);
        continue;
      }
      paths.push(item.path);
    }
  }

  // CI uses a two-file sample; extra workflows do not mark collection incomplete.
  pathsBySignal.set("ci", selectCiWorkflowPaths(ciCandidates));
  return { pathsBySignal, skippedBySignal };
}

export async function buildRepositoryProfile(
  client: GitHubClient,
  repository: RepositoryRef,
  selection: CandidateSelection,
  commitSha: string,
): Promise<RepositoryProfile> {
  const tree = await client.getTree(repository, commitSha);
  const blobs = tree.tree.filter((item) => item.type === "blob");
  const hasGitHubDirectory = tree.tree.some((item) => item.path.startsWith(".github/"));
  const { pathsBySignal, skippedBySignal } = collectSignalPaths(blobs);

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
    if (paths.length === 0) {
      const id = newId();
      ids.push(id);
      const skipped = skippedBySignal.has(signal);
      evidence.push({
        id,
        signal,
        sourceType: "repository_tree",
        commitSha,
        summary: skipped
          ? `Matching ${ABSENCE_SEARCHES[signal]} paths were skipped because they exceeded size or count limits`
          : `${tree.truncated ? "Incomplete" : "Complete"} repository-tree search found no paths matching ${ABSENCE_SEARCHES[signal]}`,
        reviewUrl: absenceReviewUrl(repository, commitSha, signal, hasGitHubDirectory),
      });
    }
    inventoryEvidenceIds.set(signal, ids);
  }

  const uniquePaths = [...new Set([...pathsBySignal.values()].flat())];
  const contents = new Map<string, string>();
  // Callout: Fetch selected file contents at the pinned commit; file 05 serves this local evidence, not GitHub.
  for (const path of uniquePaths) {
    contents.set(path, await client.getFile(repository, path, commitSha));
  }

  let workflowRuns: Awaited<ReturnType<GitHubClient["getWorkflowRuns"]>> = [];
  // Workflow-run metadata is best effort and collected separately from the pinned files.
  if ((pathsBySignal.get("ci")?.length ?? 0) > 0) {
    try {
      workflowRuns = await client.getWorkflowRuns(repository);
    } catch {
      workflowRuns = [];
    }
  }

  for (const signal of SIGNALS) {
    for (const path of pathsBySignal.get(signal) ?? []) {
      const id = newId();
      inventoryEvidenceIds.get(signal)?.push(id);
      const content = contents.get(path) ?? "";
      evidence.push(evidenceForFile(repository, signal, path, commitSha, content, id));
      if (signal === "ci") {
        const run = workflowRuns.find((item) => item.path === path || item.path.endsWith(path));
        if (run) {
          const runId = newId();
          inventoryEvidenceIds.get(signal)?.push(runId);
          evidence.push({
            id: runId,
            signal,
            sourceType: "workflow_run",
            summary: `Workflow ${path} ran with status=${run.status}, conclusion=${run.conclusion ?? "none"}, updated_at=${run.updated_at}`,
            reviewUrl: run.html_url,
          });
        }
      }
    }
  }

  // File 07 maps incomplete searches to unclear; complete searches with no selected paths become absent.
  const signalInventory: SignalInventory[] = SIGNALS.map((signal) => {
    const matchedPaths = pathsBySignal.get(signal) ?? [];
    const searchComplete = !tree.truncated && !skippedBySignal.has(signal);
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
