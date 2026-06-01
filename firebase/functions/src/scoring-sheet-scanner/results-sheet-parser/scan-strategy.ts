import type { ScanStrategy } from "../ai-scan-model.js";
import { singlePassAIParser } from './single-pass-ai-parser.js'

export type { ScanStrategy };

export const DEFAULT_SCAN_STRATEGY: ScanStrategy = "FullAIScan";

export interface StratageyParemeters {
  strategy: "FullAIScan" | "FullAIScan-Fast";
  parser: any;
  model: string;
  location: string;
}

/** Normalise client-provided strategy; unknown values fall back to the default. */
export function normalizeScanStrategy(value: unknown): ScanStrategy {
  if (typeof value === "string") {
    return value as ScanStrategy;
  }
  return DEFAULT_SCAN_STRATEGY;
}

/** Resolve model + Vertex location for the selected strategy. */
export function resolveStrategyExecution(strategy: ScanStrategy): StratageyParemeters {
  switch (strategy) {
    case "FullAIScan":
      return {
        strategy,
        parser: singlePassAIParser,
        model: "gemini-3.1-pro-preview",
        location: "global",
      };
    case "FullAIScan-Fast":
      return {
        strategy,
        parser: singlePassAIParser,
        model: "gemini-2.5-flash",
        location: "global",
      };
    default: 
      throw Error('Undefined stratagy specified');
  }
}
