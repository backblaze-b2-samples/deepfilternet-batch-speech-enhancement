"use client";

import { AudioWaveform, HardDrive, TrendingUp, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { useEnhancementStats } from "@/lib/queries";

export function StatsCards() {
  const { data: stats, isLoading, error, refetch } = useEnhancementStats();

  // Surface fetch failures inline rather than rendering a false "0" — that would
  // lie about the bucket state when really the API is unreachable.
  if (error) {
    return (
      <Card>
        <CardContent className="p-0">
          <ErrorState error={error} onRetry={() => refetch()} />
        </CardContent>
      </Card>
    );
  }

  const ratio = stats?.write_amplification_ratio ?? 0;
  const avgSnr = stats?.avg_snr_improvement_db;

  const cards = [
    {
      title: "Recordings Enhanced",
      value: stats?.recordings_enhanced ?? 0,
      icon: AudioWaveform,
    },
    {
      title: "Enhanced Bytes Written",
      value: stats?.enhanced_bytes_human ?? "0 B",
      icon: HardDrive,
    },
    {
      title: "Write Amplification",
      value: ratio ? `${ratio.toFixed(2)}×` : "—",
      icon: TrendingUp,
    },
    {
      title: "Avg SNR Improvement",
      value:
        avgSnr === null || avgSnr === undefined
          ? "—"
          : `${avgSnr > 0 ? "+" : ""}${avgSnr} dB`,
      icon: Activity,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card, i) => (
        <Card
          key={card.title}
          className={`card-hover animate-fade-in-up stagger-${i + 1}`}
        >
          <CardHeader className="flex flex-row items-center justify-between pt-4 pb-2 px-4 space-y-0">
            <CardTitle className="text-xs font-semibold text-muted-foreground">
              {card.title}
            </CardTitle>
            <div className="stat-icon-wrap">
              <card.icon className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="pb-5 px-4">
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="stat-value">{card.value}</div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
