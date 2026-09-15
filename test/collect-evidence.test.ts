import { describe, expect, it } from "vitest";
import {
  MAX_FILE_BYTES,
  MAX_FILES_PER_SIGNAL,
  collectSignalPaths,
} from "../src/04-collect-evidence.js";

describe("collectSignalPaths", () => {
  it("does not treat oversized matching files as an empty complete search", () => {
    const result = collectSignalPaths([{ path: "README.md", size: MAX_FILE_BYTES + 1 }]);

    expect(result.pathsBySignal.get("onboarding")).toEqual([]);
    expect(result.skippedBySignal.has("onboarding")).toBe(true);
    expect(result.skippedBySignal.has("ownership")).toBe(true);
  });

  it("marks a signal incomplete when extra matching files exceed the per-signal cap", () => {
    const blobs = Array.from({ length: MAX_FILES_PER_SIGNAL + 1 }, (_, index) => ({
      path: `.github/workflows/job-${index}.yml`,
      size: 100,
    }));
    const result = collectSignalPaths(blobs);

    expect(result.pathsBySignal.get("ci")).toHaveLength(MAX_FILES_PER_SIGNAL);
    expect(result.skippedBySignal.has("ci")).toBe(true);
  });
});
