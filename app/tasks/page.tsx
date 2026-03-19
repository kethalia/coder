import Link from "next/link";
import { listTasks } from "@/lib/api/tasks";
import { TaskListPoller } from "./task-list-poller";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PlusCircle } from "lucide-react";

/** Map task status to badge variant */
const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  queued: "secondary",
  running: "default",
  verifying: "outline",
  done: "default",
  failed: "destructive",
};

/** Extract org/repo from a GitHub URL */
function shortRepo(url: string): string {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
    return url;
  } catch {
    return url;
  }
}

/** Format a date as relative or short string */
function formatDate(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function TasksPage() {
  const taskList = await listTasks();

  return (
    <TaskListPoller>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
          <Button asChild>
            <Link href="/tasks/new">
              <PlusCircle className="mr-2 h-4 w-4" />
              New Task
            </Link>
          </Button>
        </div>

        {/* Empty state */}
        {taskList.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-muted-foreground text-lg">No tasks yet.</p>
              <p className="text-muted-foreground mt-1 text-sm">
                <Link href="/tasks/new" className="text-primary underline hover:no-underline">
                  Create your first task
                </Link>{" "}
                to get started.
              </p>
            </CardContent>
          </Card>
        ) : (
          /* Task table */
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Status</TableHead>
                  <TableHead>Prompt</TableHead>
                  <TableHead>Repository</TableHead>
                  <TableHead className="text-right">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {taskList.map((task) => (
                  <TableRow key={task.id}>
                    <TableCell>
                      <Badge variant={statusVariant[task.status] ?? "secondary"}>
                        {task.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/tasks/${task.id}`}
                        className="text-foreground hover:underline"
                      >
                        {task.prompt.length > 80
                          ? task.prompt.slice(0, 80) + "…"
                          : task.prompt}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <code className="text-muted-foreground text-xs">
                        {shortRepo(task.repoUrl)}
                      </code>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground text-xs">
                      {formatDate(task.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    </TaskListPoller>
  );
}
