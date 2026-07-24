import { JobDetail } from "@/components/jobs/job-detail";

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  return (
    <div className="animate-fade-in">
      <JobDetail jobId={jobId} />
    </div>
  );
}
