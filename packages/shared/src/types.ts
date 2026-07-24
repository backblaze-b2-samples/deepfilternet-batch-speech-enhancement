export type FileStatus = "uploading" | "complete" | "error";

export interface FileMetadata {
  key: string;
  filename: string;
  folder: string;
  size_bytes: number;
  size_human: string;
  content_type: string;
  uploaded_at: string;
  url: string | null;
}

export interface FileMetadataDetail {
  filename: string;
  size_bytes: number;
  size_human: string;
  mime_type: string;
  extension: string;
  md5: string;
  sha256: string;
  uploaded_at: string;
  // Image-specific
  image_width: number | null;
  image_height: number | null;
  exif: Record<string, string> | null;
  // PDF-specific
  pdf_pages: number | null;
  pdf_author: string | null;
  pdf_title: string | null;
  // Audio/Video
  duration_seconds: number | null;
  codec: string | null;
  bitrate: number | null;
}

export interface FileUploadResponse {
  key: string;
  filename: string;
  size_bytes: number;
  size_human: string;
  content_type: string;
  uploaded_at: string;
  url: string | null;
  metadata: FileMetadataDetail | null;
}

export interface DailyUploadCount {
  date: string;
  uploads: number;
}

export interface UploadStats {
  total_files: number;
  total_size_bytes: number;
  total_size_human: string;
  uploads_today: number;
  total_downloads: number;
}

// --- Speech enhancement domain (mirrors services/api/app/types/*) ---

export interface EnhancementParams {
  // null = full suppression (no attenuation cap); otherwise dB (40/30/20/12).
  attenuation_limit_db: number | null;
  post_filter: boolean;
}

export interface FileResult {
  input_key: string;
  output_key: string | null;
  input_bytes: number;
  output_bytes: number;
  duration_seconds: number | null;
  sample_rate_out: number | null;
  input_snr_db: number | null;
  output_snr_db: number | null;
  snr_delta_db: number | null;
  status: "done" | "failed";
  error: string | null;
}

export interface EnhancementJob {
  job_id: string;
  batch_name: string;
  status: "pending" | "processing" | "done" | "failed";
  created_at: string;
  model_version: string;
  device: string;
  params: EnhancementParams;
  source_keys: string[];
  results: FileResult[];
  log_key: string | null;
}

export interface JobSummary {
  job_id: string;
  batch_name: string;
  status: "pending" | "processing" | "done" | "failed";
  created_at: string;
  model_version: string;
  file_count: number;
  succeeded: number;
  failed: number;
  source_bytes: number;
  enhanced_bytes: number;
  avg_snr_improvement_db: number | null;
  log_key: string | null;
}

export interface CreateJobRequest {
  batch_name: string;
  source_keys: string[];
  params: EnhancementParams;
}

export interface EnhancementStats {
  total_jobs: number;
  recordings_enhanced: number;
  source_bytes: number;
  source_bytes_human: string;
  enhanced_bytes: number;
  enhanced_bytes_human: string;
  write_amplification_ratio: number;
  avg_snr_improvement_db: number | null;
  jobs_today: number;
}

export interface DailyBytesWritten {
  date: string;
  source_bytes: number;
  enhanced_bytes: number;
}

export interface LibraryItem {
  name: string;
  source_key: string;
  source_bytes: number;
  source_size_human: string;
  uploaded_at: string;
  enhanced_key: string | null;
  enhanced_bytes: number | null;
  enhanced_size_human: string | null;
  enhanced_at: string | null;
}
