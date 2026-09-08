import { describe, expect, it } from "vitest";
import { containsSecretLikeValue, redactSecrets } from "../src/redact.js";

// Callout: This test proves secret-like values are removed before evidence leaves collection.
describe("redactSecrets", () => {
  it("redacts common token assignments", () => {
    const value = "api_key=supersecretvalue";
    expect(containsSecretLikeValue(value)).toBe(true);
    expect(redactSecrets(value)).toBe("api_key=[REDACTED]");
  });
});
