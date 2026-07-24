import { Badge } from "@/components/ui/badge";

type JobStatus = "pending" | "processing" | "done" | "failed" | string;

const STATUS_STYLES: Record<string, string> = {
  done: "bg-[var(--success)]/15 text-[var(--success)] border-transparent",
  processing: "bg-primary/15 text-primary border-transparent",
  pending: "bg-muted text-muted-foreground border-transparent",
  failed: "bg-destructive/15 text-destructive border-transparent",
};

const STATUS_LABELS: Record<string, string> = {
  done: "Done",
  processing: "Processing",
  pending: "Pending",
  failed: "Failed",
};

export function JobStatusBadge({ status }: { status: JobStatus }) {
  const cls = STATUS_STYLES[status] ?? "bg-muted text-muted-foreground border-transparent";
  const label = STATUS_LABELS[status] ?? status;
  return (
    <Badge variant="outline" className={`text-xs font-medium ${cls}`}>
      {label}
    </Badge>
  );
}
