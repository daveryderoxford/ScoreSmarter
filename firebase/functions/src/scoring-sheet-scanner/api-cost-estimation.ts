export interface ModelTierConfig {
  inputUnder200k: number;
  outputUnder200k: number;
  inputOver200k: number;
  outputOver200k: number;
  hasContextThreshold: boolean;
}

/** Per-million-token pricing (USD). Keys match Gemini model ids used for AI scan. */
export const DYNAMIC_MODEL_PRICING: Record<string, ModelTierConfig> = {
  "gemini-3.1-pro-preview": {
    inputUnder200k: 2.0, outputUnder200k: 12.0,
    inputOver200k: 4.0, outputOver200k: 18.0,
    hasContextThreshold: true,
  },
  "gemini-2.5-pro": {
    inputUnder200k: 1.25, outputUnder200k: 10.0,
    inputOver200k: 2.50, outputOver200k: 15.0,
    hasContextThreshold: true,
  },
  /* Figures for full price from Jan 2027 - currently half price */
  "gemini-3.7-flash": {
    inputUnder200k: 1.5, outputUnder200k: 7.5,
    inputOver200k: 1.5, outputOver200k: 7.5,
    hasContextThreshold: false,
  },
  "gemini-3.5-flash": {
    inputUnder200k: 1.5, outputUnder200k: 9.0,
    inputOver200k: 1.5, outputOver200k: 9.0,
    hasContextThreshold: false,
  },
  "gemini-2.5-flash": {
    inputUnder200k: 0.3, outputUnder200k: 2.5,
    inputOver200k: 0.3, outputOver200k: 2.5,
    hasContextThreshold: false,
  },
  "gemini-3.1-flash-lite": {
    inputUnder200k: 0.25, outputUnder200k: 1.5,
    inputOver200k: 0.25, outputOver200k: 1.5,
    hasContextThreshold: false,
  },
};

export interface CostEstimationOptions {
  /** USD to local currency (e.g. 0.76 for GBP). */
  exchangeRate?: number;
  /** e.g. 1.20 for 20% UK VAT. */
  taxMultiplier?: number;
}

/** Default billing assumptions for UK clubs (GBP inc. VAT). */
export const DEFAULT_SCAN_COST_OPTIONS: Required<CostEstimationOptions> = {
  exchangeRate: 0.76,
  taxMultiplier: 1.20,
};

export function calculateRealizedApiCost(
  model: string,
  inputTokens: number | null,
  outputTokens: number | null,
  options: CostEstimationOptions = DEFAULT_SCAN_COST_OPTIONS,
): number | null {
  if (inputTokens == null || outputTokens == null) return null;

  const modelConfig = DYNAMIC_MODEL_PRICING[model];
  if (!modelConfig) return null;

  const isOverThreshold = modelConfig.hasContextThreshold && inputTokens > 200_000;

  const inputRate = isOverThreshold ? modelConfig.inputOver200k : modelConfig.inputUnder200k;
  const outputRate = isOverThreshold ? modelConfig.outputOver200k : modelConfig.outputUnder200k;

  const costUsd = ((inputTokens * inputRate) + (outputTokens * outputRate)) / 1_000_000;

  const exchangeRate = options.exchangeRate ?? DEFAULT_SCAN_COST_OPTIONS.exchangeRate;
  const taxMultiplier = options.taxMultiplier ?? DEFAULT_SCAN_COST_OPTIONS.taxMultiplier;

  return costUsd * exchangeRate * taxMultiplier;
}
