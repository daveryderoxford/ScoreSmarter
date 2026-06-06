/** Metrics returned to the client after a scan completes. */
export interface ScanExecutionMetrics {
  success: boolean;
  errorMessage?: string;
  strategy: string;
  parser: "singlePassAIParser";
  model: string;
  location: string;
  executionTimeSec: number;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedApiCostUsd: number | null;
}
