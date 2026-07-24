/**
 * Client-side allow-list for the dropzone, mirroring the backend's
 * `ALLOWED_TYPES` / `MIME_EXTENSION_MAP` in
 * `services/api/app/service/upload.py`. The server re-validates every upload —
 * this only gives instant feedback and filters the OS file picker. Keep the two
 * in sync when adding or removing a type (a unit test fails loudly on drift).
 *
 * Audio formats lead: this app ingests source recordings for denoising. The
 * generic image/PDF/text/archive types are retained for the File Explorer.
 *
 * Shape matches react-dropzone's `accept`: MIME type → matching extensions.
 */
export const ACCEPTED_FILE_TYPES: Record<string, string[]> = {
  // Audio (source recordings)
  "audio/wav": [".wav"],
  "audio/x-wav": [".wav"],
  "audio/mpeg": [".mp3", ".mpeg"],
  "audio/flac": [".flac"],
  "audio/x-flac": [".flac"],
  "audio/ogg": [".ogg", ".oga"],
  // Generic (retained File Explorer surface)
  "image/jpeg": [".jpg", ".jpeg", ".jfif"],
  "image/png": [".png"],
  "image/gif": [".gif"],
  "image/webp": [".webp"],
  "application/pdf": [".pdf"],
  "text/plain": [".txt", ".text", ".log", ".md"],
  "text/csv": [".csv"],
  "application/json": [".json"],
  "application/zip": [".zip"],
  "video/mp4": [".mp4"],
};
