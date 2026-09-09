import { describe, expect, it } from "vitest";
import { fileSignals, isBot } from "../src/support/github-client.js";

// Callout: These tests protect the deterministic mapping from repository files to signals.
describe("fileSignals", () => {
  it("maps shared agent artifacts", () => {
    expect(fileSignals(".github/prompts/review.prompt.md")).toContain("prompts");
    expect(fileSignals(".github/skills/deploy/SKILL.md")).toContain("skill_or_spec");
    expect(fileSignals(".github/agents/reviewer.md")).toContain("skill_or_spec");
  });

  it("maps CI, ownership, and onboarding", () => {
    expect(fileSignals(".github/workflows/ci.yml")).toContain("ci");
    expect(fileSignals(".github/CODEOWNERS")).toContain("ownership");
    expect(fileSignals("README.md")).toEqual(expect.arrayContaining(["ownership", "onboarding"]));
  });

  it("does not treat nested READMEs or test setup files as repository-level signals", () => {
    expect(fileSignals("src/lang/README.md")).not.toContain("ownership");
    expect(fileSignals("test/e2e/setup.ts")).not.toContain("onboarding");
  });
});

describe("isBot", () => {
  it("recognizes GitHub bot identities", () => {
    expect(isBot({ login: "dependabot[bot]", type: "Bot" })).toBe(true);
    expect(isBot({ login: "josepalafox", type: "User" })).toBe(false);
  });
});
