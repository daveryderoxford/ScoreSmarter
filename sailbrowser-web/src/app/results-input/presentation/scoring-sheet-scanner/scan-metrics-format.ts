import type { ScanExecutionMetrics } from '@shared/scan-metrics';

export function formatScanMetricsSummary(metrics: ScanExecutionMetrics): string {
  const parts: string[] = [
    metrics.success ? 'Scan succeeded' : 'Scan failed',
    `${metrics.strategy} · ${metrics.model}`,
    `${metrics.executionTimeSec.toFixed(1)}s`,
  ];

  if (metrics.inputTokens != null && metrics.outputTokens != null) {
    parts.push(`${metrics.inputTokens.toLocaleString()} in / ${metrics.outputTokens.toLocaleString()} out tokens`);
  }

  if (metrics.estimatedApiCostUsd != null) {
    parts.push(`est. $${metrics.estimatedApiCostUsd.toFixed(5)}`);
  }

  return parts.join(' · ');
}

export function formatUsd(value: number | null | undefined): string {
  if (value == null) return '—';
  return `$${value.toFixed(5)}`;
}
