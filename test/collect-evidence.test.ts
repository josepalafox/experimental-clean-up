import { describe, expect, it } from "vitest";
import {
  MAX_FILE_BYTES,
  collectSignalPaths,
} from "../src/04-collect-evidence.js";
import { MAX_CI_WORKFLOWS } from "../src/support/github-client.js";

describe("collectSignalPaths", () => {
  it("still collects a repository README that exceeds the generic file size cap", () => {
    const result = collectSignalPaths([{ path: "README.md", size: MAX_FILE_BYTES + 1 }]);

    expect(result.pathsBySignal.get("onboarding")).toEqual(["README.md"]);
    expect(result.skippedBySignal.has("onboarding")).toBe(false);
  });

  it("does not treat oversized matching files as an empty complete search", () => {
    const result = collectSignalPaths([{ path: "docs/setup.md", size: MAX_FILE_BYTES + 1 }]);

    expect(result.pathsBySignal.get("onboarding")).toEqual([]);
    expect(result.skippedBySignal.has("onboarding")).toBe(true);
  });

  it("samples one or two CI workflows instead of marking extras incomplete", () => {
    const blobs = [
      { path: ".github/workflows/codeql.yml", size: 100 },
      { path: ".github/workflows/stale.yml", size: 100 },
      { path: ".github/workflows/ci.yml", size: 100 },
      { path: ".github/workflows/publish.yml", size: 100 },
      { path: ".github/workflows/notify.yml", size: 100 },
      { path: ".github/workflows/sponsors.yml", size: 100 },
    ];
    const result = collectSignalPaths(blobs);

    expect(result.pathsBySignal.get("ci")).toEqual([
      ".github/workflows/ci.yml",
      ".github/workflows/notify.yml",
    ]);
    expect(result.pathsBySignal.get("ci")).toHaveLength(MAX_CI_WORKFLOWS);
    expect(result.skippedBySignal.has("ci")).toBe(false);
  });
});
