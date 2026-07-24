"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Download, FileText, RotateCcw, Trash2 } from "lucide-react";
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
import { ErrorState } from "@/components/ui/error-state";
import { JobStatusBadge } from "@/components/jobs/job-status-badge";
import { AudioPlayer } from "@/components/audio/audio-player";
import { ApiError, getDownloadUrl } from "@/lib/api-client";
import { useDeleteJob, useJob, useRerunJob } from "@/lib/queries";
import { formatDate, humanizeBytes } from "@/lib/utils";

function basename(key: string) {
  return key.split("/").pop() ?? key;
}

function snr(v: number | null) {
  return v === null || v === undefined ? "—" : `${v} dB`;
}

function delta(v: number | null) {
  if (v === null || v === undefined) return "—";
  return `${v > 0 ? "+" : ""}${v} dB`;
}

export function JobDetail({ jobId }: { jobId: string }) {
  const router = useRouter();
  const { data: job, isLoading, error, refetch } = useJob(jobId);
  const rerun = useRerunJob();
  const del = useDeleteJob();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const download = async (key: string) => {
    try {
      const { url } = await getDownloadUrl(key);
      window.open(url, "_blank");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Download failed");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (error || !job) {
    return (
      <ErrorState
        error={error ?? new Error("Job not found")}
        title="Couldn't load job"
        onRetry={() => refetch()}
      />
    );
  }

  const done = job.results.filter((r) => r.status === "done");
  const attenuation =
    job.params.attenuation_limit_db === null
      ? "Full suppression"
      : `${job.params.attenuation_limit_db} dB`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <Button asChild variant="ghost" size="sm" className="h-7 -ml-2 text-xs text-muted-foreground">
            <Link href="/jobs">
              <ArrowLeft className="h-3.5 w-3.5" />
              All jobs
            </Link>
          </Button>
          <h1 className="page-title break-words">{job.batch_name}</h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <JobStatusBadge status={job.status} />
            <span>·</span>
            <span>{job.model_version}</span>
            <span>·</span>
            <span>device: {job.device}</span>
            <span>·</span>
            <span>{formatDate(job.created_at)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {job.log_key && (
            <Button variant="outline" size="sm" className="h-8" onClick={() => download(job.log_key as string)}>
              <FileText className="h-3.5 w-3.5" />
              Log
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            disabled={rerun.isPending}
            onClick={() =>
              rerun.mutate(job.job_id, {
                onSuccess: (fresh) => {
                  toast.success("Re-run complete");
                  router.push(`/jobs/${fresh.job_id}`);
                },
                onError: (err) => toast.error(err.message || "Re-run failed"),
              })
            }
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Re-run
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-destructive hover:text-destructive"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="border-b border-border py-4 px-5">
          <CardTitle className="card-title">Parameters</CardTitle>
        </CardHeader>
        <CardContent className="p-5 grid gap-4 sm:grid-cols-3 text-sm">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Attenuation limit</div>
            <div className="mt-1 font-medium">{attenuation}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Post-filter</div>
            <div className="mt-1 font-medium">{job.params.post_filter ? "On" : "Off"}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Files</div>
            <div className="mt-1 font-medium">{done.length}/{job.results.length} enhanced</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-border py-4 px-5">
          <CardTitle className="card-title">Per-file results</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recording</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Duration</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">In SNR*</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Out SNR*</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">ΔSNR*</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Size</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {job.results.map((r) => (
                <TableRow key={r.input_key} className="table-row-hover">
                  <TableCell className="font-medium max-w-[16rem] truncate" title={r.input_key}>
                    {basename(r.input_key)}
                    {r.error && (
                      <span className="block text-xs text-destructive truncate">{r.error}</span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                    {r.duration_seconds ? `${r.duration_seconds.toFixed(1)}s` : "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs tabular-nums text-muted-foreground whitespace-nowrap">{snr(r.input_snr_db)}</TableCell>
                  <TableCell className="font-mono text-xs tabular-nums text-muted-foreground whitespace-nowrap">{snr(r.output_snr_db)}</TableCell>
                  <TableCell className="font-mono text-xs tabular-nums whitespace-nowrap">{delta(r.snr_delta_db)}</TableCell>
                  <TableCell className="font-mono text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                    {humanizeBytes(r.input_bytes)} → {r.output_bytes ? humanizeBytes(r.output_bytes) : "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <JobStatusBadge status={r.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="px-5 py-3 text-xs text-muted-foreground">
            * SNR is a reference-free <em>estimate</em> (no clean reference exists);
            treat it as a relative indicator, not a measured value.
          </p>
        </CardContent>
      </Card>

      {done.length > 0 && (
        <Card>
          <CardHeader className="border-b border-border py-4 px-5">
            <CardTitle className="card-title">Before / after</CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-6">
            {done.map((r) => (
              <div key={r.input_key} className="space-y-3 rounded-md border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium truncate">{basename(r.input_key)}</span>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => download(r.output_key as string)}>
                    <Download className="h-3.5 w-3.5" />
                    Download enhanced
                  </Button>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Before (source)</div>
                    <AudioPlayer objectKey={r.input_key} label={`Original ${basename(r.input_key)}`} />
                  </div>
                  <div className="space-y-1.5">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">After (enhanced)</div>
                    <AudioPlayer objectKey={r.output_key} label={`Enhanced ${basename(r.input_key)}`} />
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete job?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the JSONL log and the enhanced outputs this
              job produced. Source recordings are kept. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={del.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                del.mutate(job.job_id, {
                  onSuccess: () => {
                    toast.success("Job deleted");
                    router.push("/jobs");
                  },
                  onError: (err) => toast.error(err.message || "Delete failed"),
                  onSettled: () => setConfirmDelete(false),
                })
              }
              disabled={del.isPending}
              className={buttonVariants({ variant: "destructive" })}
            >
              {del.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
