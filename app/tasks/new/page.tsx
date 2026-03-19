"use client";

import { useRef, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { createTaskAction } from "@/lib/actions/tasks";
import { readFileAsBase64 } from "@/lib/helpers/format";
import type { TaskAttachment } from "@/lib/types/tasks";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

export default function NewTaskPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { execute, result, isPending } = useAction(createTaskAction, {
    onSuccess: ({ data }) => {
      if (data) {
        router.push(`/tasks/${data.id}`);
      }
    },
  });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);

    const prompt = formData.get("prompt") as string;
    const repoUrl = formData.get("repoUrl") as string;

    let attachments: TaskAttachment[] | undefined;
    const files = fileInputRef.current?.files;
    if (files && files.length > 0) {
      attachments = await Promise.all(
        Array.from(files).map(async (file) => ({
          name: file.name,
          data: await readFileAsBase64(file),
          type: file.type || "application/octet-stream",
        }))
      );
    }

    execute({ prompt, repoUrl, attachments });
  }

  const serverError = result.serverError;
  const validationErrors = result.validationErrors;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">New Task</h1>

      {serverError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Submission failed</AlertTitle>
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Task Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="prompt">
                Prompt <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="prompt"
                name="prompt"
                required
                rows={4}
                placeholder="Describe what you want built..."
              />
              {validationErrors?.prompt && (
                <p className="text-xs text-destructive">
                  {validationErrors.prompt._errors?.[0]}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="repoUrl">
                Repository URL <span className="text-destructive">*</span>
              </Label>
              <Input
                id="repoUrl"
                name="repoUrl"
                type="url"
                required
                placeholder="https://github.com/org/repo"
              />
              {validationErrors?.repoUrl && (
                <p className="text-xs text-destructive">
                  {validationErrors.repoUrl._errors?.[0]}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="attachments">
                File Attachments <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="attachments"
                name="attachments"
                type="file"
                multiple
                ref={fileInputRef}
              />
              <p className="text-xs text-muted-foreground">
                Attach any reference files for the task.
              </p>
            </div>

            <div className="pt-2">
              <Button type="submit" disabled={isPending}>
                {isPending ? "Submitting…" : "Create Task"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
