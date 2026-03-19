import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (same pattern as __tests__/lib/api/tasks.test.ts) ──────

vi.mock("uuid", () => ({
  v4: vi.fn(() => "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
}));

vi.mock("ioredis", () => ({
  default: vi.fn().mockImplementation(() => ({
    status: "ready",
    disconnect: vi.fn(),
    quit: vi.fn(),
  })),
}));

vi.mock("@/lib/queue/connection", () => ({
  getRedisConnection: vi.fn(() => ({
    status: "ready",
    disconnect: vi.fn(),
    quit: vi.fn(),
  })),
}));

const mockQueueAdd = vi.fn().mockResolvedValue({ id: "job-1" });

vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: mockQueueAdd,
    close: vi.fn(),
  })),
  Worker: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    close: vi.fn(),
  })),
}));

const mockReturning = vi.fn();
const mockInsertValues = vi.fn().mockReturnValue({
  returning: mockReturning,
});
const mockInsert = vi.fn().mockReturnValue({
  values: mockInsertValues,
});

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => ({
    insert: mockInsert,
    query: {
      tasks: { findFirst: vi.fn() },
    },
  })),
}));

vi.mock("@/lib/db/schema", () => ({
  tasks: { id: "id" },
  taskLogs: {},
  workspaces: {},
}));

// ── Import under test ────────────────────────────────────────────

import { createTask } from "@/lib/api/tasks";

// ── Tests ─────────────────────────────────────────────────────────

describe("createTask attachments handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsertValues.mockReturnValue({ returning: mockReturning });
  });

  it("stores attachments when provided", async () => {
    const attachments = [
      { name: "spec.md", data: "YmFzZTY0", type: "text/markdown" },
    ];

    mockReturning.mockResolvedValue([
      {
        id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        prompt: "Fix bug",
        repoUrl: "https://github.com/test/repo",
        status: "queued",
        branch: "hive/aaaaaaaa/fix-bug",
        attachments,
        prUrl: null,
        errorMessage: null,
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01"),
      },
    ]);

    const task = await createTask({
      prompt: "Fix bug",
      repoUrl: "https://github.com/test/repo",
      attachments,
    });

    expect(task.attachments).toEqual(attachments);

    // Verify the insert values included attachments
    const insertValuesCall = mockInsertValues.mock.calls[0][0];
    expect(insertValuesCall).toMatchObject({
      attachments,
    });
  });

  it("stores null when attachments not provided", async () => {
    mockReturning.mockResolvedValue([
      {
        id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        prompt: "Fix bug",
        repoUrl: "https://github.com/test/repo",
        status: "queued",
        branch: "hive/aaaaaaaa/fix-bug",
        attachments: null,
        prUrl: null,
        errorMessage: null,
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01"),
      },
    ]);

    const task = await createTask({
      prompt: "Fix bug",
      repoUrl: "https://github.com/test/repo",
    });

    expect(task.attachments).toBeNull();

    // Verify the insert values passed null for attachments
    const insertValuesCall = mockInsertValues.mock.calls[0][0];
    expect(insertValuesCall).toMatchObject({
      attachments: null,
    });
  });
});
