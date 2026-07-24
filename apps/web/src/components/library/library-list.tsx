"use client";

import Link from "next/link";
import { Download, Library as LibraryIcon, RefreshCw, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { AudioPlayer } from "@/components/audio/audio-player";
import { ApiError, getDownloadUrl } from "@/lib/api-client";
import { useLibrary } from "@/lib/queries";

export function LibraryList() {
  const { data: items = [], isLoading, isFetching, error, refetch } = useLibrary();

  const download = async (key: string) => {
    try {
      const { url } = await getDownloadUrl(key);
      window.open(url, "_blank");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Download failed");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 space-y-0">
        <CardTitle className="card-title">Audio Library</CardTitle>
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
      </CardHeader>
      <CardContent className="p-5">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
        ) : error ? (
          <ErrorState error={error} title="Couldn't load the library" onRetry={() => refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={LibraryIcon}
            title="No recordings yet"
            description="Upload source recordings, then run an enhancement job to hear before/after here."
            action={
              <Button asChild size="sm">
                <Link href="/upload">
                  <Upload className="h-3.5 w-3.5" />
                  Upload recordings
                </Link>
              </Button>
            }
          />
        ) : (
          <div className="space-y-4">
            {items.map((item) => (
              <div key={item.source_key} className="space-y-3 rounded-md border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium truncate">{item.name}</span>
                  {item.enhanced_key ? (
                    <Badge variant="outline" className="bg-[var(--success)]/15 text-[var(--success)] border-transparent text-xs">
                      Enhanced
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      Source only
                    </Badge>
                  )}
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Source · {item.source_size_human}
                      </span>
                      <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => download(item.source_key)}>
                        <Download className="h-3 w-3" />
                      </Button>
                    </div>
                    <AudioPlayer objectKey={item.source_key} label={`Source ${item.name}`} />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Enhanced{item.enhanced_size_human ? ` · ${item.enhanced_size_human}` : ""}
                      </span>
                      {item.enhanced_key && (
                        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => download(item.enhanced_key as string)}>
                          <Download className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                    <AudioPlayer objectKey={item.enhanced_key} label={`Enhanced ${item.name}`} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
