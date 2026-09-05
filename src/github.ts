import type { ActivityEvent, EvidenceItem, RepositoryRef, Signal } from "./types.js";
import { redactSecrets } from "./redact.js";

const API_ROOT = "https://api.github.com";
const USER_AGENT = "experimental-clean-up/0.1";

interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  default_branch: string;
  created_at: string;
  updated_at: string;
  archived: boolean;
  fork: boolean;
  private: boolean;
  owner: { login: string };
}

interface GitHubCommit {
  sha: string;
  html_url: string;
  author: { login: string; type?: string } | null;
  commit: { author: { date: string | null; name: string } | null };
}

interface GitHubContributor {
  login: string;
  contributions: number;
  type?: string;
}

interface GitHubRelease {
  html_url: string;
  published_at: string | null;
  created_at: string;
  author: { login: string; type?: string };
}

interface GitHubIssue {
  html_url: string;
  created_at: string;
  closed_at: string | null;
  user: { login: string; type?: string };
  closed_by?: { login: string; type?: string } | null;
  pull_request?: unknown;
}

interface GitHubIssueComment {
  html_url: string;
  created_at: string;
  user: { login: string; type?: string };
}

interface GitTreeItem {
  path: string;
  type: "blob" | "tree";
  size?: number;
}

interface GitTreeResponse {
  sha: string;
  truncated: boolean;
  tree: GitTreeItem[];
}

interface ContentResponse {
  type: "file";
  encoding: "base64";
  content: string;
  size: number;
  html_url: string;
}

interface WorkflowRun {
  id: number;
  path: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  conclusion: string | null;
  status: string;
}

interface WorkflowRunsResponse {
  workflow_runs: WorkflowRun[];
}

export class GitHubApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string,
  ) {
    super(message);
  }
}

export class GitHubClient {
  requestCount = 0;

  constructor(
    private readonly token: string | undefined,
    private readonly maxRequests = 500,
  ) {}

  private async request<T>(
    path: string,
    init: RequestInit = {},
    tokenOverride?: string,
  ): Promise<T> {
    if (this.requestCount >= this.maxRequests) {
      throw new GitHubApiError(`GitHub request budget of ${this.maxRequests} exhausted`, 429, path);
    }
    this.requestCount += 1;

    const token = tokenOverride ?? this.token;
    const response = await fetch(`${API_ROOT}${path}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": USER_AGENT,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new GitHubApiError(
        `GitHub ${response.status} for ${path}: ${detail.slice(0, 300)}`,
        response.status,
        path,
      );
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  private async paginate<T>(path: string, maxPages = 10): Promise<T[]> {
    const separator = path.includes("?") ? "&" : "?";
    const collected: T[] = [];
    for (let page = 1; page <= maxPages; page += 1) {
      const items = await this.request<T[]>(`${path}${separator}per_page=100&page=${page}`);
      collected.push(...items);
      if (items.length < 100) break;
    }
    return collected;
  }

  async listOwnedPublicRepositories(owner: string, excludedRepository: string): Promise<RepositoryRef[]> {
    const repositories = await this.paginate<GitHubRepository>(
      `/users/${encodeURIComponent(owner)}/repos?type=owner&sort=full_name&direction=asc`,
    );

    return repositories
      .filter((repo) => repo.owner.login.toLowerCase() === owner.toLowerCase())
      .filter((repo) => !repo.private && !repo.archived && !repo.fork)
      .filter((repo) => repo.name !== excludedRepository)
      .map((repo) => ({
        id: repo.id,
        owner: repo.owner.login,
        name: repo.name,
        fullName: repo.full_name,
        htmlUrl: repo.html_url,
        defaultBranch: repo.default_branch,
        createdAt: repo.created_at,
        updatedAt: repo.updated_at,
        archived: repo.archived,
        fork: repo.fork,
        visibility: "public" as const,
      }));
  }

  async getPrimaryContributor(repo: RepositoryRef): Promise<string | null> {
    const contributors = await this.request<GitHubContributor[]>(
      `/repos/${repo.fullName}/contributors?per_page=100&anon=0`,
    );
    return contributors.find((contributor) => !isBot(contributor))?.login ?? null;
  }

  async getLatestCommit(repo: RepositoryRef): Promise<GitHubCommit> {
    const commits = await this.request<GitHubCommit[]>(`/repos/${repo.fullName}/commits?per_page=100`);
    const commit = commits.find((item) => !isBot(item.author));
    if (!commit) throw new GitHubApiError(`No human commit found for ${repo.fullName}`, 404, "commits");
    return commit;
  }

  async collectHumanActivity(
    repo: RepositoryRef,
    primaryContributor: string | null,
  ): Promise<{ events: ActivityEvent[]; unavailableSources: string[]; commitSha: string }> {
    const unavailableSources: string[] = [];
    const events: ActivityEvent[] = [];
    const commits = await this.request<GitHubCommit[]>(`/repos/${repo.fullName}/commits?per_page=100`);
    const head = commits[0];
    if (!head) throw new GitHubApiError(`No commits found for ${repo.fullName}`, 404, "commits");

    for (const commit of commits) {
      const actor = commit.author?.login ?? commit.commit.author?.name;
      const occurredAt = commit.commit.author?.date;
      if (actor && occurredAt && !isBot(commit.author ?? { login: actor })) {
        events.push({ type: "commit", actor, occurredAt, url: commit.html_url });
        break;
      }
    }

    if (!primaryContributor) {
      return { events, unavailableSources: ["primary_contributor_activity"], commitSha: head.sha };
    }

    const sources: Array<Promise<void>> = [
      this.request<GitHubRelease[]>(`/repos/${repo.fullName}/releases?per_page=100`)
        .then((releases) => {
          const release = releases.find(
            (item) => sameLogin(item.author.login, primaryContributor) && !isBot(item.author),
          );
          if (release) {
            events.push({
              type: "release",
              actor: release.author.login,
              occurredAt: release.published_at ?? release.created_at,
              url: release.html_url,
            });
          }
        })
        .catch(() => {
          unavailableSources.push("releases");
        }),
      this.request<GitHubIssue[]>(
        `/repos/${repo.fullName}/issues?state=all&creator=${encodeURIComponent(primaryContributor)}&sort=created&direction=desc&per_page=100`,
      )
        .then((issues) => {
          const issue = issues.find((item) => !item.pull_request && !isBot(item.user));
          if (issue) {
            events.push({
              type: "issue_opened",
              actor: issue.user.login,
              occurredAt: issue.created_at,
              url: issue.html_url,
            });
          }
        })
        .catch(() => {
          unavailableSources.push("issues");
        }),
      this.request<GitHubIssueComment[]>(
        `/repos/${repo.fullName}/issues/comments?sort=created&direction=desc&per_page=100`,
      )
        .then((comments) => {
          const comment = comments.find(
            (item) => sameLogin(item.user.login, primaryContributor) && !isBot(item.user),
          );
          if (comment) {
            events.push({
              type: "issue_comment",
              actor: comment.user.login,
              occurredAt: comment.created_at,
              url: comment.html_url,
            });
          }
        })
        .catch(() => {
          unavailableSources.push("issue_comments");
        }),
      this.request<GitHubIssue[]>(
        `/repos/${repo.fullName}/issues?state=closed&labels=security&sort=updated&direction=desc&per_page=100`,
      )
        .then((issues) => {
          const issue = issues.find(
            (item) => !item.pull_request && item.closed_at && item.closed_by && !isBot(item.closed_by),
          );
          if (issue?.closed_at && issue.closed_by) {
            events.push({
              type: "security_issue_closed",
              actor: issue.closed_by.login,
              occurredAt: issue.closed_at,
              url: issue.html_url,
            });
          }
        })
        .catch(() => {
          unavailableSources.push("security_issues");
        }),
    ];

    await Promise.all(sources);
    return { events, unavailableSources, commitSha: head.sha };
  }

  async getTree(repo: RepositoryRef, commitSha: string): Promise<GitTreeResponse> {
    return this.request<GitTreeResponse>(
      `/repos/${repo.fullName}/git/trees/${encodeURIComponent(commitSha)}?recursive=1`,
    );
  }

  async getFile(repo: RepositoryRef, path: string, commitSha: string): Promise<string> {
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    const file = await this.request<ContentResponse>(
      `/repos/${repo.fullName}/contents/${encodedPath}?ref=${encodeURIComponent(commitSha)}`,
    );
    if (file.type !== "file" || file.encoding !== "base64") {
      throw new GitHubApiError(`Unsupported content response for ${path}`, 422, path);
    }
    return redactSecrets(Buffer.from(file.content.replace(/\n/g, ""), "base64").toString("utf8"));
  }

  async getWorkflowRuns(repo: RepositoryRef): Promise<WorkflowRun[]> {
    const response = await this.request<WorkflowRunsResponse>(
      `/repos/${repo.fullName}/actions/runs?per_page=100`,
    );
    return response.workflow_runs;
  }

  async upsertTrackingIssue(
    owner: string,
    repository: string,
    title: string,
    body: string,
    writeToken: string,
  ): Promise<string> {
    try {
      await this.request(`/repos/${owner}/${repository}/labels/cleanup-review`, {}, writeToken);
    } catch (error) {
      if (!(error instanceof GitHubApiError) || error.status !== 404) throw error;
      await this.request(
        `/repos/${owner}/${repository}/labels`,
        {
          method: "POST",
          body: JSON.stringify({
            name: "cleanup-review",
            color: "D4A72C",
            description: "Repository stewardship findings awaiting human review",
          }),
        },
        writeToken,
      );
    }

    const issues = await this.request<Array<{ number: number; title: string; html_url: string }>>(
      `/repos/${owner}/${repository}/issues?state=open&labels=cleanup-review&per_page=100`,
      {},
      writeToken,
    );
    const existing = issues.find((issue) => issue.title === title);
    if (existing) {
      const updated = await this.request<{ html_url: string }>(
        `/repos/${owner}/${repository}/issues/${existing.number}`,
        { method: "PATCH", body: JSON.stringify({ body }) },
        writeToken,
      );
      return updated.html_url;
    }

    const created = await this.request<{ html_url: string }>(
      `/repos/${owner}/${repository}/issues`,
      { method: "POST", body: JSON.stringify({ title, body, labels: ["cleanup-review"] }) },
      writeToken,
    );
    return created.html_url;
  }
}

export function isBot(actor: { login?: string; type?: string } | null): boolean {
  if (!actor) return false;
  return actor.type === "Bot" || /\[bot\]$/i.test(actor.login ?? "") || /^(dependabot|renovate)$/i.test(actor.login ?? "");
}

function sameLogin(first: string, second: string): boolean {
  return first.toLowerCase() === second.toLowerCase();
}

export function fileSignals(path: string): Signal[] {
  const normalized = path.toLowerCase();
  const basename = normalized.split("/").at(-1) ?? normalized;
  const repositoryLevel = !normalized.includes("/");
  const documentationLevel = repositoryLevel || normalized.startsWith("docs/");
  const signals = new Set<Signal>();

  if (normalized.startsWith(".github/prompts/")) signals.add("prompts");
  if (
    normalized.startsWith(".github/skills/") ||
    normalized.startsWith(".github/agents/") ||
    normalized.startsWith(".github/instructions/") ||
    /(^|\/)(spec|specification|design|architecture)([-_.].*)?\.(md|txt|ya?ml)$/.test(normalized)
  ) {
    signals.add("skill_or_spec");
  }
  if (normalized.startsWith(".github/workflows/") && /\.ya?ml$/.test(normalized)) signals.add("ci");
  if (
    ["codeowners", ".github/codeowners", "docs/codeowners"].includes(normalized) ||
    (repositoryLevel && ["readme.md", "security.md"].includes(basename))
  ) {
    signals.add("ownership");
  }
  if (
    (repositoryLevel && basename === "readme.md") ||
    (documentationLevel && /^(setup|install|bootstrap|getting-started|quickstart|run)([-_.].*)?\.(md|sh|bash|py|js|ts)$/.test(basename))
  ) {
    signals.add("onboarding");
  }
  return [...signals];
}

export function evidenceForFile(
  repo: RepositoryRef,
  signal: Signal,
  path: string,
  commitSha: string,
  content: string,
  id: string,
): EvidenceItem {
  return {
    id,
    signal,
    sourceType: "file",
    path,
    commitSha,
    content,
    summary: `${path} at ${commitSha.slice(0, 7)}`,
    reviewUrl: `${repo.htmlUrl}/blob/${commitSha}/${path.split("/").map(encodeURIComponent).join("/")}`,
  };
}
