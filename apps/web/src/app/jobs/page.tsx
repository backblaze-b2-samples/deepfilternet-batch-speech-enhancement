import Link from "next/link";
import { AudioWaveform } from "lucide-react";

import { Button } from "@/components/ui/button";
import { JobsList } from "@/components/jobs/jobs-list";

export default function JobsPage() {
  return (
    <div className="space-y-8">
      <div className="animate-fade-in flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div className="min-w-0">
          <h1 className="page-title">Enhancement Jobs</h1>
          <p className="mt-1.5 max-w-prose text-sm text-muted-foreground">
            Batch denoise runs over your source recordings. Create a job, view
            per-file results, re-run, or delete.
          </p>
        </div>
        <Button asChild size="sm" className="h-8 shrink-0">
          <Link href="/jobs/new">
            <AudioWaveform aria-hidden="true" className="h-3.5 w-3.5" />
            New enhancement
          </Link>
        </Button>
      </div>
      <div className="animate-fade-in-up stagger-2">
        <JobsList />
      </div>
    </div>
  );
}
