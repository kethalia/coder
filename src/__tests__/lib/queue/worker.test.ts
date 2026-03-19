import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────

// Mock IORedis — must be before imports that trigger getRedisConnection
vi.mock("ioredis", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      status: "ready",
      disconnect: vi.fn(),
      quit: vi.fn(),
    })),
  };
});

// Mock the Redis connection module directly
vi.mock("@/lib/queue/connection", () => ({
  getRedisConnection: vi.fn(() => ({
    status: "ready",
    disconnect: vi.fn(),
    quit: vi.fn(),
  })),
}));

// Mock BullMQ Queue and Worker
const mockQueueAdd = vi.fn().mockResolvedValue({ id: "job-1" });
const mockWorkerOn = vi.fn();

vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: mockQueueAdd,
    close: vi.fn(),
  })),
  Worker: vi.fn().mockImplementation((name: string, processor: Function, opts: unknown) => {
    // Store the processor so we can invoke it in tests
    (Worker as any).__lastProcessor = processor;
    return {
      on: mockWorkerOn,
      close: vi.fn(),
    };
  }),
}));

// Capture the Worker import for accessing __lastProcessor
import { Worker } from "bullmq";

// Mock Prisma client
const mockTaskUpdate = vi.fn().mockResolvedValue({});
const mockWorkspaceCreate = vi.fn().mockResolvedValue({});
const mockWorkspaceUpdate = vi.fn().mockResolvedValue({});
const mockTaskLogCreate = vi.fn().mockResolvedValue({});

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => ({
    task: {
      update: mockTaskUpdate,
    },
    workspace: {
      create: mockWorkspaceCreate,
      update: mockWorkspaceUpdate,
    },
    taskLog: {
      create: mockTaskLogCreate,
    },
  })),
}));

// Mock runBlueprint
const mockRunBlueprint = vi.fn();
vi.mock("@/lib/blueprint/runner", () => ({
  runBlueprint: (...args: unknown[]) => mockRunBlueprint(...args),
}));

// Mock step factories (they just need to return objects)
vi.mock("@/lib/blueprint/steps/hydrate", () => ({
  createHydrateStep: vi.fn(() => ({ name: "hydrate-context", execute: vi.fn() })),
}));
vi.mock("@/lib/blueprint/steps/rules", () => ({
  createRulesStep: vi.fn(() => ({ name: "scoped-rules", execute: vi.fn() })),
}));
vi.mock("@/lib/blueprint/steps/tools", () => ({
  createToolsStep: vi.fn(() => ({ name: "tool-selection", execute: vi.fn() })),
}));
vi.mock("@/lib/blueprint/steps/agent", () => ({
  createAgentStep: vi.fn(() => ({ name: "agent-execution", execute: vi.fn() })),
}));

// ── Imports under test ────────────────────────────────────────────

import { getTaskQueue, createTaskWorker, type TaskJobData } from "@/lib/queue/task-queue";
import type { CoderClient } from "@/lib/coder/client";

// ── Helpers ───────────────────────────────────────────────────────

function makeMockCoderClient(overrides?: Partial<Record<string, any>>) {
  return {
    createWorkspace: vi.fn().mockResolvedValue({
      id: "ws-001",
      name: "hive-worker-abc12345",
      template_id: "tmpl-1",
      owner_name: "me",
      latest_build: { id: "build-1", status: "starting", job: { status: "running", error: "" } },
    }),
    waitForBuild: vi.fn().mockResolvedValue({
      id: "ws-001",
      name: "hive-worker-abc12345",
      latest_build: { id: "build-1", status: "running", job: { status: "succeeded", error: "" } },
    }),
    getWorkspaceAgentName: vi.fn().mockResolvedValue("hive-worker-abc12345.main"),
    ...overrides,
  } as unknown as CoderClient;
}

const fakeJobData: TaskJobData = {
  taskId: "abc12345-6789-0000-0000-000000000000",
  repoUrl: "https://github.com/test/repo",
  prompt: "Fix the bug",
  branchName: "hive/abc12345/fix-the-bug",
  params: {},
};

// ── Tests ─────────────────────────────────────────────────────────

describe("BullMQ task-dispatch queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  describe("getTaskQueue()", () => {
    it("returns a Queue instance that can add jobs", async () => {
      const queue = getTaskQueue();

      await queue.add("dispatch", fakeJobData, { jobId: "abc-123" });

      expect(mockQueueAdd).toHaveBeenCalledWith("dispatch", fakeJobData, {
        jobId: "abc-123",
      });
    });
  });

  describe("createTaskWorker()", () => {
    it("creates a Worker with configurable concurrency", () => {
      const client = makeMockCoderClient();
      createTaskWorker(client);

      expect(Worker).toHaveBeenCalledWith(
        "task-dispatch",
        expect.any(Function),
        expect.objectContaining({
          concurrency: 5,
        })
      );
    });

    it("full success flow: create workspace → waitForBuild → blueprint → status done", async () => {
      const client = makeMockCoderClient();
      mockRunBlueprint.mockResolvedValue({
        success: true,
        steps: [
          { name: "hydrate-context", status: "success", message: "ok", durationMs: 100 },
          { name: "scoped-rules", status: "success", message: "ok", durationMs: 50 },
          { name: "tool-selection", status: "success", message: "ok", durationMs: 30 },
          { name: "agent-execution", status: "success", message: "Changes made", durationMs: 5000 },
        ],
        totalDurationMs: 5180,
      });

      createTaskWorker(client);
      const processor = (Worker as any).__lastProcessor;
      const fakeJob = { id: "job-1", data: fakeJobData };

      await processor(fakeJob);

      // 1. Task set to running
      expect(mockTaskUpdate).toHaveBeenCalledWith({
        where: { id: fakeJobData.taskId },
        data: { status: "running" },
      });

      // 2. Workspace created via Coder
      expect(client.createWorkspace).toHaveBeenCalledWith(
        expect.any(String),
        "hive-worker-abc12345",
        expect.objectContaining({
          task_id: fakeJobData.taskId,
          repo_url: fakeJobData.repoUrl,
        })
      );

      // 3. Workspace recorded in DB
      expect(mockWorkspaceCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          taskId: fakeJobData.taskId,
          coderWorkspaceId: "ws-001",
          status: "starting",
        }),
      });

      // 4. waitForBuild called with 5-min timeout
      expect(client.waitForBuild).toHaveBeenCalledWith("ws-001", "running", {
        timeoutMs: 300_000,
      });

      // 5. Workspace status updated to running
      expect(mockWorkspaceUpdate).toHaveBeenCalledWith({
        where: { coderWorkspaceId: "ws-001" },
        data: { status: "running" },
      });

      // 6. Agent name resolved
      expect(client.getWorkspaceAgentName).toHaveBeenCalledWith("ws-001");

      // 7. Blueprint ran with 4 steps
      expect(mockRunBlueprint).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ name: "hydrate-context" }),
          expect.objectContaining({ name: "agent-execution" }),
        ]),
        expect.objectContaining({
          taskId: fakeJobData.taskId,
          workspaceName: "hive-worker-abc12345.main",
          repoUrl: fakeJobData.repoUrl,
          prompt: fakeJobData.prompt,
        })
      );

      // 8. Task set to done
      expect(mockTaskUpdate).toHaveBeenCalledWith({
        where: { id: fakeJobData.taskId },
        data: { status: "done" },
      });

      // 9. Step outcomes logged
      expect(mockTaskLogCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          taskId: fakeJobData.taskId,
          message: expect.stringContaining("agent-execution"),
        }),
      });
    });

    it("blueprint failure → task status 'failed' with step name in errorMessage", async () => {
      const client = makeMockCoderClient();
      mockRunBlueprint.mockResolvedValue({
        success: false,
        steps: [
          { name: "hydrate-context", status: "success", message: "ok", durationMs: 100 },
          { name: "scoped-rules", status: "success", message: "ok", durationMs: 50 },
          { name: "tool-selection", status: "success", message: "ok", durationMs: 30 },
          { name: "agent-execution", status: "failure", message: "Pi exited with code 1: rate limit", durationMs: 2000 },
        ],
        totalDurationMs: 2180,
      });

      createTaskWorker(client);
      const processor = (Worker as any).__lastProcessor;
      const fakeJob = { id: "job-3", data: fakeJobData };

      await processor(fakeJob);

      // Task set to failed with descriptive error
      expect(mockTaskUpdate).toHaveBeenCalledWith({
        where: { id: fakeJobData.taskId },
        data: {
          status: "failed",
          errorMessage: expect.stringContaining('agent-execution'),
        },
      });

      // Error message includes the step name and Pi's error
      const failCall = mockTaskUpdate.mock.calls.find(
        (c: any) => c[0]?.data?.status === "failed"
      );
      expect(failCall).toBeDefined();
      expect(failCall![0].data.errorMessage).toContain("rate limit");
    });

    it("workspace creation error → task status 'failed' and error re-thrown", async () => {
      const failingClient = {
        createWorkspace: vi.fn().mockRejectedValue(new Error("Coder API down")),
      } as unknown as CoderClient;

      createTaskWorker(failingClient);
      const processor = (Worker as any).__lastProcessor;

      const fakeJob = {
        id: "job-2",
        data: {
          taskId: "fail0000-0000-0000-0000-000000000000",
          repoUrl: "https://github.com/test/repo",
          prompt: "Will fail",
          branchName: "hive/fail0000/will-fail",
          params: {},
        } satisfies TaskJobData,
      };

      await expect(processor(fakeJob)).rejects.toThrow("Coder API down");

      // Task set to running first, then failed
      expect(mockTaskUpdate).toHaveBeenCalledTimes(2);
      expect(mockTaskUpdate).toHaveBeenCalledWith({
        where: { id: "fail0000-0000-0000-0000-000000000000" },
        data: { status: "failed", errorMessage: "Coder API down" },
      });

      // Error logged to taskLogs
      expect(mockTaskLogCreate).toHaveBeenCalled();
    });
  });
});
