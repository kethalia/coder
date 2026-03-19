import { describe, it, expect } from "vitest";
import { tasks, taskLogs, workspaces, taskStatusEnum, workspaceStatusEnum } from "@/lib/db/schema";

describe("Drizzle schema", () => {
  it("exports tasks table with expected columns", () => {
    expect(tasks).toBeDefined();
    // Verify key columns exist on the table definition
    const columnNames = Object.keys(tasks);
    expect(columnNames).toContain("id");
    expect(columnNames).toContain("prompt");
    expect(columnNames).toContain("repoUrl");
    expect(columnNames).toContain("status");
    expect(columnNames).toContain("createdAt");
    expect(columnNames).toContain("updatedAt");
  });

  it("exports taskLogs table with expected columns", () => {
    expect(taskLogs).toBeDefined();
    const columnNames = Object.keys(taskLogs);
    expect(columnNames).toContain("id");
    expect(columnNames).toContain("taskId");
    expect(columnNames).toContain("message");
    expect(columnNames).toContain("level");
  });

  it("exports workspaces table with expected columns", () => {
    expect(workspaces).toBeDefined();
    const columnNames = Object.keys(workspaces);
    expect(columnNames).toContain("id");
    expect(columnNames).toContain("taskId");
    expect(columnNames).toContain("coderWorkspaceId");
    expect(columnNames).toContain("status");
  });

  it("defines task_status enum with correct values", () => {
    expect(taskStatusEnum.enumValues).toEqual([
      "queued",
      "running",
      "verifying",
      "done",
      "failed",
    ]);
  });

  it("defines workspace_status enum with correct values", () => {
    expect(workspaceStatusEnum.enumValues).toEqual([
      "pending",
      "starting",
      "running",
      "stopped",
      "deleted",
      "failed",
    ]);
  });
});
