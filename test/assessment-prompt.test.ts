import { describe, expect, it } from "vitest";
import { selectOnboardingPassages } from "../src/support/assessment-prompt.js";

describe("selectOnboardingPassages", () => {
  it("keeps original line numbers for install sections deep in a README", () => {
    const lines = Array.from({ length: 530 }, (_, index) => {
      if (index === 0) return "# Axios";
      if (index === 525) return "## Installing";
      if (index === 526) return "```bash";
      if (index === 527) return "npm install axios";
      if (index === 528) return "```";
      if (index === 529) return "## API";
      return "badge";
    });
    const selected = selectOnboardingPassages(lines.join("\n"));
    expect(selected).toContain("526 | ## Installing");
    expect(selected).toContain("528 | npm install axios");
    expect(selected).not.toContain("1 | # Axios");
    expect(selected).not.toContain("## API");
  });

  it("inlines the full file when no install headings exist", () => {
    const selected = selectOnboardingPassages("# Tiny\n\nHello.\n");
    expect(selected).toContain("1 | # Tiny");
    expect(selected).toContain("3 | Hello.");
  });
});
