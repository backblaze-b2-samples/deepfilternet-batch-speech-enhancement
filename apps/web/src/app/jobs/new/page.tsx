import { NewJobForm } from "@/components/jobs/new-job-form";

export default function NewJobPage() {
  return (
    <div className="space-y-8">
      <div className="animate-fade-in border-b border-border pb-5">
        <h1 className="page-title">New enhancement</h1>
        <p className="mt-1.5 max-w-prose text-sm text-muted-foreground text-pretty">
          Pick source recordings and denoising options, then run DeepFilterNet
          over the batch. Cleaned 48 kHz WAVs and a JSONL log are written to B2.
        </p>
      </div>
      <div className="animate-fade-in-up stagger-2 max-w-3xl">
        <NewJobForm />
      </div>
    </div>
  );
}
