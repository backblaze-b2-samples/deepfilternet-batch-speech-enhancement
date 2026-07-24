"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { BarChart3 } from "lucide-react";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useBytesActivity } from "@/lib/queries";

const MB = 1024 * 1024;

const chartConfig = {
  source_mb: { label: "Source", color: "var(--chart-2)" },
  enhanced_mb: { label: "Enhanced", color: "var(--chart-1)" },
} satisfies ChartConfig;

const skeletonBarHeights = ["h-24", "h-32", "h-20", "h-36", "h-28", "h-40", "h-24"];

function BytesChartSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="h-[240px] w-full rounded-md border border-border bg-muted/20 px-4 py-4"
    >
      <span className="sr-only">Loading bytes-written activity</span>
      <div aria-hidden className="flex h-full items-end gap-3">
        {skeletonBarHeights.map((height, i) => (
          <Skeleton
            key={i}
            className={`${height} min-w-0 flex-1 motion-reduce:animate-none`}
          />
        ))}
      </div>
    </div>
  );
}

export function UploadChart() {
  const { data: activity, isLoading, error, refetch } = useBytesActivity(7);

  const data = useMemo(
    () =>
      (activity ?? []).map((d) => ({
        date: new Date(d.date + "T00:00:00").toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        source_mb: +(d.source_bytes / MB).toFixed(2),
        enhanced_mb: +(d.enhanced_bytes / MB).toFixed(2),
      })),
    [activity],
  );

  const totalEnhanced = data.reduce((sum, d) => sum + d.enhanced_mb, 0);
  const hasKnownActivity = activity !== undefined;
  const hasAnyBytes = data.some((d) => d.source_mb > 0 || d.enhanced_mb > 0);

  return (
    <Card>
      <CardHeader className="border-b border-border py-4 px-5">
        <CardTitle className="card-title">Bytes Written</CardTitle>
        <CardDescription className="text-xs">
          Source vs enhanced (MB) · last 7 days
        </CardDescription>
        <CardAction className="text-right self-center">
          {isLoading ? (
            <div aria-hidden className="space-y-1">
              <Skeleton className="ml-auto h-2.5 w-16 motion-reduce:animate-none" />
              <Skeleton className="ml-auto h-6 w-12 motion-reduce:animate-none" />
            </div>
          ) : (
            <>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Enhanced MB
              </div>
              <div className="text-lg font-semibold tabular-nums tracking-tight leading-tight">
                {hasKnownActivity ? totalEnhanced.toFixed(1) : "-"}
              </div>
            </>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="p-5">
        {isLoading ? (
          <BytesChartSkeleton />
        ) : error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : !hasAnyBytes ? (
          <EmptyState
            icon={BarChart3}
            title="No bytes written yet"
            description="Run an enhancement job to see source vs enhanced bytes here."
          />
        ) : (
          <ChartContainer config={chartConfig} className="h-[240px] w-full">
            <BarChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
              <CartesianGrid
                vertical={false}
                strokeDasharray="3 3"
                stroke="var(--border)"
              />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={10}
                fontSize={11}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={6}
                fontSize={11}
                width={36}
                unit="M"
              />
              <ChartTooltip
                cursor={{ fill: "var(--accent-subtle)" }}
                content={<ChartTooltipContent />}
              />
              <Bar
                dataKey="source_mb"
                fill="var(--color-source_mb)"
                radius={[4, 4, 0, 0]}
                animationDuration={500}
                animationEasing="ease-out"
              />
              <Bar
                dataKey="enhanced_mb"
                fill="var(--color-enhanced_mb)"
                radius={[4, 4, 0, 0]}
                animationDuration={500}
                animationEasing="ease-out"
              />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
