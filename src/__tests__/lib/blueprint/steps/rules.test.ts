import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BlueprintContext } from "@/lib/blueprint/types";
import type { ExecResult } from "@/lib/workspace/exec";

vi.mock("@/lib/workspace/exec", () => ({
  execInWorkspace: vi.fn(),
}));

import { createRulesStep } from "@/lib/blueprint/steps/rules";
import { execInWorkspace } from "@/lib/workspace/exec";

const mockExec = vi.mocked(execInWorkspace);

function makeCtx(overrides?: Partial<BlueprintContext>): BlueprintContext {
  return {
    taskId: "test-task-1",
    workspaceName: "test-ws",
    repoUrl: "https://github.com/org/repo",
    prompt: "Fix the bug",
    branchName: "fix/bug-123",
    assembledContext: "",
    scopedRules: "",
    toolFlags: [],
    piProvider: "anthropic",
    piModel: "claude-sonnet-4-20250514",
    ...overrides,
  };
}

function ok(stdout: string): ExecResult {
  return { stdout, stderr: "", exitCode: 0 };
}

describe("createRulesStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("finds and concatenates multiple AGENTS.md files", async () => {
    const step = createRulesStep();
    const ctx = makeCtx();

    mockExec.mockImplementation(async (_ws, cmd) => {
      if (cmd.startsWith("find")) {
        return ok("/home/coder/project/AGENTS.md\n/home/coder/project/src/AGENTS.md");
      }
      if (cmd.includes("cat") && cmd.includes("project/AGENTS.md") && !cmd.includes("src")) {
        return ok("Use strict TypeScript.");
      }
      if (cmd.includes("cat") && cmd.includes("src/AGENTS.md")) {
        return ok("No any types allowed.");
      }
      return ok("");
    });

    const result = await step.execute(ctx);

    expect(result.status).toBe("success");
    expect(result.message).toContain("2");
    expect(ctx.scopedRules).toContain("## Rules from /home/coder/project/AGENTS.md");
    expect(ctx.scopedRules).toContain("Use strict TypeScript.");
    expect(ctx.scopedRules).toContain("## Rules from /home/coder/project/src/AGENTS.md");
    expect(ctx.scopedRules).toContain("No any types allowed.");
  });

  it("returns skipped when no AGENTS.md files exist", async () => {
    const step = createRulesStep();
    const ctx = makeCtx();

    mockExec.mockImplementation(async () => ok(""));

    const result = await step.execute(ctx);

    expect(result.status).toBe("skipped");
    expect(result.message).toContain("No AGENTS.md");
    expect(ctx.scopedRules).toBe(""); // unchanged
  });

  it("single AGENTS.md at root populates scopedRules", async () => {
    const step = createRulesStep();
    const ctx = makeCtx();

    mockExec.mockImplementation(async (_ws, cmd) => {
      if (cmd.startsWith("find")) {
        return ok("/home/coder/project/AGENTS.md");
      }
      if (cmd.includes("cat")) {
        return ok("Follow conventional commits.");
      }
      return ok("");
    });

    const result = await step.execute(ctx);

    expect(result.status).toBe("success");
    expect(result.message).toContain("1");
    expect(ctx.scopedRules).toContain("## Rules from /home/coder/project/AGENTS.md");
    expect(ctx.scopedRules).toContain("Follow conventional commits.");
  });
});
