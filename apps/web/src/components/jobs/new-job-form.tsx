"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useCreateJob, useFiles } from "@/lib/queries";

// Finite attenuation-limit options → a selector (never free text). "none" maps
// to full suppression (DeepFilterNet atten_lim = None).
const ATTENUATION_CHOICES = [
  { value: "none", label: "None (full suppression)" },
  { value: "40", label: "40 dB" },
  { value: "30", label: "30 dB" },
  { value: "20", label: "20 dB" },
  { value: "12", label: "12 dB" },
] as const;

const schema = z.object({
  batch_name: z.string().min(1, "Give the batch a name").max(120),
  attenuation: z.enum(["none", "40", "30", "20", "12"]),
  post_filter: z.boolean(),
  source_keys: z.array(z.string()).min(1, "Pick at least one recording"),
});

type FormValues = z.infer<typeof schema>;

const AUDIO_EXT = /\.(wav|mp3|mpeg|flac|ogg|oga)$/i;

export function NewJobForm() {
  const router = useRouter();
  const createJob = useCreateJob();
  // Source recordings already ingested to B2 under the source/ prefix.
  const { data: files = [], isLoading, error, refetch } = useFiles("source/", 1000);
  const recordings = files.filter(
    (f) => f.content_type.startsWith("audio/") || AUDIO_EXT.test(f.filename),
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    // CREATE-form safe defaults: expressed as defaults + guidance, never autofilled.
    defaultValues: {
      batch_name: "",
      attenuation: "none",
      post_filter: false,
      source_keys: [],
    },
  });

  const onSubmit = (values: FormValues) => {
    const attenuation_limit_db =
      values.attenuation === "none" ? null : Number(values.attenuation);
    createJob.mutate(
      {
        batch_name: values.batch_name,
        source_keys: values.source_keys,
        params: { attenuation_limit_db, post_filter: values.post_filter },
      },
      {
        onSuccess: (job) => {
          toast.success(`Enhanced ${job.results.length} recording(s)`);
          router.push(`/jobs/${job.job_id}`);
        },
        onError: (err) => toast.error(err.message || "Enhancement failed"),
      },
    );
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader className="border-b border-border py-4 px-5">
            <CardTitle className="card-title">Batch</CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-6">
            <FormField
              control={form.control}
              name="batch_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Batch name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. podcast-ep-2026-07" {...field} />
                  </FormControl>
                  <FormDescription>
                    A label to find this run later. Free text.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="source_keys"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Source recordings</FormLabel>
                  <FormDescription>
                    Pick one or more recordings ingested via Upload.
                  </FormDescription>
                  <FormControl>
                    <div className="mt-2 max-h-64 overflow-y-auto rounded-md border border-border divide-y divide-border">
                      {isLoading ? (
                        <div className="space-y-2 p-3">
                          {Array.from({ length: 4 }).map((_, i) => (
                            <Skeleton key={i} className="h-6 w-full" />
                          ))}
                        </div>
                      ) : error ? (
                        <ErrorState error={error} onRetry={() => refetch()} className="p-4" />
                      ) : recordings.length === 0 ? (
                        <div className="p-6 text-center text-sm text-muted-foreground space-y-3">
                          <p>No recordings under <code>source/</code> yet.</p>
                          <Button asChild size="sm" variant="outline">
                            <Link href="/upload">
                              <Upload className="h-3.5 w-3.5" />
                              Upload recordings
                            </Link>
                          </Button>
                        </div>
                      ) : (
                        recordings.map((f) => (
                          <label
                            key={f.key}
                            className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50"
                          >
                            <Checkbox
                              checked={field.value.includes(f.key)}
                              onCheckedChange={(c) =>
                                field.onChange(
                                  c === true
                                    ? [...field.value, f.key]
                                    : field.value.filter((k) => k !== f.key),
                                )
                              }
                            />
                            <span className="min-w-0 flex-1 truncate">{f.filename}</span>
                            <span className="font-mono text-xs text-muted-foreground tabular-nums">
                              {f.size_human}
                            </span>
                          </label>
                        ))
                      )}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border py-4 px-5">
            <CardTitle className="card-title">Denoising options</CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-6">
            <FormField
              control={form.control}
              name="attenuation"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Attenuation limit</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-72">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {ATTENUATION_CHOICES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Default (full suppression) removes the most noise; lower dB
                    values keep more of the original ambience.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="post_filter"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-md border border-border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Post-filter</FormLabel>
                    <FormDescription>
                      Off by default — on gives sharper speech with a slight risk
                      of artifacts.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.push("/jobs")}>
            Cancel
          </Button>
          <Button type="submit" disabled={createJob.isPending}>
            {createJob.isPending ? "Enhancing…" : "Run enhancement"}
          </Button>
        </div>
        {createJob.isPending && (
          <p className="text-right text-xs text-muted-foreground" aria-live="polite">
            Running DeepFilterNet on each recording — this can take a moment.
          </p>
        )}
      </form>
    </Form>
  );
}
