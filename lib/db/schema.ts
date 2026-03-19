import { pgTable, pgEnum, text, timestamp, uuid, jsonb } from "drizzle-orm/pg-core";

// --- Enums ---

export const taskStatusEnum = pgEnum("task_status", [
  "queued",
  "running",
  "verifying",
  "done",
  "failed",
]);

export const workspaceStatusEnum = pgEnum("workspace_status", [
  "pending",
  "starting",
  "running",
  "stopped",
  "deleted",
  "failed",
]);

// --- Tables ---

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  prompt: text("prompt").notNull(),
  repoUrl: text("repo_url").notNull(),
  status: taskStatusEnum("status").default("queued").notNull(),
  branch: text("branch"),
  prUrl: text("pr_url"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  attachments: jsonb("attachments"),
});

export const taskLogs = pgTable("task_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id")
    .notNull()
    .references(() => tasks.id),
  message: text("message").notNull(),
  level: text("level").default("info").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id")
    .notNull()
    .references(() => tasks.id),
  coderWorkspaceId: text("coder_workspace_id"),
  templateType: text("template_type").default("worker").notNull(),
  status: workspaceStatusEnum("status").default("pending").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
