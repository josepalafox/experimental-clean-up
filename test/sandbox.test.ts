import { Agent } from "@cursor/sdk";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("local SDK sandbox", () => {
  it("can preflight the platform sandbox helper", () => {
    const helper = join("node_modules", `@cursor/sdk-${process.platform}-${process.arch}`, "bin", "cursorsandbox");
    const policyDir = mkdtempSync(join(tmpdir(), "cursorsandbox-"));
    const policyPath = join(policyDir, "policy.json");
    writeFileSync(
      policyPath,
      JSON.stringify({
        version: 1,
        networkPolicyStrict: false,
        sandbox: {
          type: "workspace_readwrite",
          cwd: process.cwd(),
          additionalReadwritePaths: [],
          additionalReadonlyPaths: {},
          networkAccess: false,
          disableTmpWrite: false,
        },
      }),
    );
    const result = spawnSync(helper, ["--policy", policyPath, "--preflight-only", "--", "/bin/true"], {
      encoding: "utf8",
    });
    expect(result.error, result.stderr).toBeUndefined();
    expect(result.status, result.stderr || result.stdout).toBe(0);
  });

  it("authenticates the Cursor API key outside the sandbox", async () => {
    let agent: Awaited<ReturnType<typeof Agent.create>> | undefined;
    try {
      agent = await Agent.create({
        apiKey: process.env.CURSOR_API_KEY ?? "invalid-sandbox-probe-key",
        model: { id: "auto" },
        tools: ["mcp"],
        local: {
          cwd: process.cwd(),
          settingSources: [],
          sandboxOptions: { enabled: true },
        },
      });
      if (!process.env.CURSOR_API_KEY) {
        throw new Error("expected authentication to fail for an invalid key");
      }
    } catch (error) {
      if (process.env.CURSOR_API_KEY) throw error;
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toMatch(/ConfigurationError|sandbox helper|bubblewrap/i);
      expect(message).toMatch(/api key/i);
    } finally {
      agent?.close();
    }
  });
});
