"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { usePreviewUrl } from "@/lib/queries";

interface AudioPlayerProps {
  objectKey: string | null | undefined;
  label?: string;
}

/**
 * Streams an object straight from B2 via a presigned URL. The URL is fetched
 * lazily (only when the component mounts) and the browser plays the bytes
 * inline — Content-Disposition is irrelevant for a subresource load.
 */
export function AudioPlayer({ objectKey, label }: AudioPlayerProps) {
  const enabled = !!objectKey;
  const { data, isLoading, isError } = usePreviewUrl(objectKey ?? undefined, enabled);

  if (!objectKey) {
    return (
      <p className="text-xs text-muted-foreground italic">Not available yet</p>
    );
  }
  if (isLoading) {
    return <Skeleton className="h-10 w-full" />;
  }
  if (isError || !data?.url) {
    return (
      <p className="text-xs text-destructive" aria-live="polite">
        Playback link unavailable
      </p>
    );
  }
  return (
    <audio
      controls
      preload="none"
      src={data.url}
      className="w-full"
      aria-label={label ?? `Play ${objectKey}`}
    >
      Your browser does not support the audio element.
    </audio>
  );
}
