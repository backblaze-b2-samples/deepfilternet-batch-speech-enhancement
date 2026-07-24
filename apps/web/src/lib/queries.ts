"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  createJob,
  deleteFile,
  deleteJob,
  getBytesActivity,
  getEnhancementStats,
  getFileDetail,
  getFiles,
  getFileStats,
  getHealth,
  getJob,
  getJobs,
  getLibrary,
  getPreviewUrl,
  getUploadActivity,
  rerunJob,
} from "@/lib/api-client";
import type {
  CreateJobRequest,
  EnhancementJob,
  FileMetadata,
  FileMetadataDetail,
  JobSummary,
  LibraryItem,
} from "@deepfilternet-batch-speech-enhancement/shared";

// Single source of truth for query keys. Keep these tightly scoped so that
// invalidating "files" doesn't blow away unrelated caches, and so an IDE
// "find usages" of `qk.files` reveals every consumer.
export const qk = {
  all: ["b2"] as const,
  files: (prefix?: string, limit?: number) =>
    [...qk.all, "files", prefix ?? "", limit ?? 100] as const,
  stats: () => [...qk.all, "stats"] as const,
  uploadActivity: (days: number) =>
    [...qk.all, "stats", "activity", days] as const,
  preview: (key: string) => [...qk.all, "preview", key] as const,
  detail: (key: string) => [...qk.all, "detail", key] as const,
  health: () => [...qk.all, "health"] as const,
  // Enhancement domain
  jobs: () => [...qk.all, "jobs"] as const,
  job: (jobId: string) => [...qk.all, "job", jobId] as const,
  enhancementStats: () => [...qk.all, "enhancement-stats"] as const,
  bytesActivity: (days: number) =>
    [...qk.all, "bytes-activity", days] as const,
  library: () => [...qk.all, "library"] as const,
};

export type Health = Awaited<ReturnType<typeof getHealth>>;

export function useFiles(prefix = "", limit = 100) {
  return useQuery<FileMetadata[], ApiError>({
    queryKey: qk.files(prefix, limit),
    queryFn: () => getFiles(prefix, limit),
  });
}

export function useFileStats() {
  return useQuery({
    queryKey: qk.stats(),
    queryFn: getFileStats,
  });
}

export function useUploadActivity(days = 7) {
  return useQuery({
    queryKey: qk.uploadActivity(days),
    queryFn: () => getUploadActivity(days),
  });
}

// Presigned preview URL — only fetched when `enabled` is true (e.g., when
// the dialog opens for a specific file). Kept short-lived (60s) because
// the URL itself has a presigned expiry and is cheap to regenerate.
export function usePreviewUrl(key: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: qk.preview(key ?? ""),
    queryFn: () => getPreviewUrl(key as string),
    enabled: enabled && !!key,
    staleTime: 60_000,
  });
}

// Rich metadata for an already-stored file. The server recomputes it on demand
// (a full object download), so it's only fetched when `enabled` — i.e. the
// preview dialog is open AND the user expands "Detailed metadata". Kept
// short-lived like the preview URL; cheap correctness under key overwrites.
export function useFileDetail(key: string | undefined, enabled: boolean) {
  return useQuery<FileMetadataDetail, ApiError>({
    queryKey: qk.detail(key ?? ""),
    queryFn: () => getFileDetail(key as string),
    enabled: enabled && !!key,
    staleTime: 60_000,
  });
}

// Health poll for the top-of-app B2 banner. `retry: false` and letting a
// failed fetch leave `data` undefined keeps a down API silent (the
// per-component ErrorState covers that); the banner only reacts to an up API
// reporting b2_connected: false. Polls every 60s and on window focus.
export function useHealth() {
  return useQuery<Health>({
    queryKey: qk.health(),
    queryFn: getHealth,
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: false,
  });
}

export function useDeleteFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fileKey: string) => deleteFile(fileKey),
    // After delete, blow away every cached file list + stats. Cheap and
    // correct — the dashboard re-fetches lazily as components remount.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.all });
    },
  });
}

// --- Enhancement jobs / library / denoising stats ---

export function useEnhancementStats() {
  return useQuery({
    queryKey: qk.enhancementStats(),
    queryFn: getEnhancementStats,
  });
}

export function useBytesActivity(days = 7) {
  return useQuery({
    queryKey: qk.bytesActivity(days),
    queryFn: () => getBytesActivity(days),
  });
}

export function useJobs() {
  return useQuery<JobSummary[], ApiError>({
    queryKey: qk.jobs(),
    queryFn: getJobs,
  });
}

export function useJob(jobId: string | undefined) {
  return useQuery<EnhancementJob, ApiError>({
    queryKey: qk.job(jobId ?? ""),
    queryFn: () => getJob(jobId as string),
    enabled: !!jobId,
  });
}

export function useCreateJob() {
  const qc = useQueryClient();
  return useMutation<EnhancementJob, ApiError, CreateJobRequest>({
    mutationFn: (body) => createJob(body),
    // A new job writes enhanced outputs + a log; invalidate everything B2-backed.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.all });
    },
  });
}

export function useRerunJob() {
  const qc = useQueryClient();
  return useMutation<EnhancementJob, ApiError, string>({
    mutationFn: (jobId) => rerunJob(jobId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.all });
    },
  });
}

export function useDeleteJob() {
  const qc = useQueryClient();
  return useMutation<{ deleted: boolean; job_id: string }, ApiError, string>({
    mutationFn: (jobId) => deleteJob(jobId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.all });
    },
  });
}

export function useLibrary() {
  return useQuery<LibraryItem[], ApiError>({
    queryKey: qk.library(),
    queryFn: getLibrary,
  });
}
