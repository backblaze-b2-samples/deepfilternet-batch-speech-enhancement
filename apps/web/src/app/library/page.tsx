import Link from "next/link";
import { Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { LibraryList } from "@/components/library/library-list";

export default function LibraryPage() {
  return (
    <div className="space-y-8">
      <div className="animate-fade-in flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div className="min-w-0">
          <h1 className="page-title">Audio Library</h1>
          <p className="mt-1.5 max-w-prose text-sm text-muted-foreground">
            Source recordings paired with their enhanced outputs — before/after
            playback, scoped to this app&apos;s{" "}
            <code>source/</code> and <code>enhanced/</code> prefixes. For the full
            bucket, use <Link href="/files" className="underline">Files</Link>.
          </p>
        </div>
        <Button asChild size="sm" className="h-8 shrink-0">
          <Link href="/upload">
            <Upload aria-hidden="true" className="h-3.5 w-3.5" />
            Upload
          </Link>
        </Button>
      </div>
      <div className="animate-fade-in-up stagger-2">
        <LibraryList />
      </div>
    </div>
  );
}
