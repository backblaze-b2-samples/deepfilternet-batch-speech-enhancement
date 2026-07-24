"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AudioWaveform, Eye, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { JobStatusBadge } from "@/components/jobs/job-status-badge";
import { useDeleteJob, useJobs, useRerunJob } from "@/lib/queries";
import { formatDate, humanizeBytes } from "@/lib/utils";
import type { JobSummary } from "@deepfilternet-batch-speech-enhancement/shared";

export function JobsList() {
  const router = useRouter();
  const { data: jobs = [], isLoading, isFetching, error, refetch } = useJobs();
  const rerun = useRerunJob();
  const del = useDeleteJob();
  const [deleteTarget, setDeleteTarget] = useState<JobSummary | null>(null);

  const handleRerun = (job: JobSummary) => {
    toast.info(`Re-running "${job.batch_name}"...`);
    rerun.mutate(job.job_id, {
      onSuccess: (fresh) => {
        toast.success("Re-run complete");
        router.push(`/jobs/${fresh.job_id}`);
      },
      onError: (err) => toast.error(err.message || "Re-run failed"),
    });
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    del.mutate(target.job_id, {
      onSuccess: () => toast.success(`"${target.batch_name}" deleted`),
      onError: (err) => toast.error(err.message || "Delete failed"),
      onSettled: () => setDeleteTarget(null),
    });
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 space-y-0">
          <CardTitle className="card-title">Enhancement Jobs</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="h-7 text-xs"
              disabled={isFetching}
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button asChild size="sm" className="h-7 text-xs">
              <Link href="/jobs/new">
                <AudioWaveform className="h-3.5 w-3.5" />
                New enhancement
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0" aria-busy={isLoading || isFetching}>
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : error ? (
            <ErrorState error={error} title="Couldn't load jobs" onRetry={() => refetch()} className="px-4" />
          ) : jobs.length === 0 ? (
            <EmptyState
              icon={AudioWaveform}
              title="No enhancement jobs yet"
              description="Upload recordings, then create a job to denoise them."
              action={
                <Button asChild size="sm">
                  <Link href="/jobs/new">
                    <AudioWaveform className="h-3.5 w-3.5" />
                    New enhancement
                  </Link>
                </Button>
              }
              className="px-4"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Batch</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Files</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Source → Enhanced</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Avg ΔSNR</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Created</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</TableHead>
                  <TableHead className="text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow key={job.job_id} className="table-row-hover">
                    <TableCell className="font-medium max-w-[16rem]">
                      <Link href={`/jobs/${job.job_id}`} className="block truncate hover:underline">
                        {job.batch_name}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                      {job.succeeded}/{job.file_count}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                      {humanizeBytes(job.source_bytes)} → {humanizeBytes(job.enhanced_bytes)}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                      {job.avg_snr_improvement_db === null
                        ? "—"
                        : `${job.avg_snr_improvement_db > 0 ? "+" : ""}${job.avg_snr_improvement_db} dB`}
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {formatDate(job.created_at)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <JobStatusBadge status={job.status} />
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <Button asChild variant="ghost" size="icon" className="h-7 w-7" aria-label="View job">
                          <Link href={`/jobs/${job.job_id}`}>
                            <Eye className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          aria-label="Re-run job"
                          disabled={rerun.isPending}
                          onClick={() => handleRerun(job)}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          aria-label="Delete job"
                          onClick={() => setDeleteTarget(job)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete job?</AlertDialogTitle>
            <AlertDialogDescription className="break-words">
              This permanently deletes the JSONL log for{" "}
              <strong className="font-semibold text-foreground">{deleteTarget?.batch_name}</strong>{" "}
              and the enhanced outputs it produced. Source recordings are kept. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={del.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={del.isPending}
              className={buttonVariants({ variant: "destructive" })}
            >
              {del.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
