import type { ScannerThinkingLevel } from '@shared/scanner-context';

export const DEFAULT_SCAN_MODEL = 'gemini-3.7-flash';
export const DEFAULT_SCAN_THINKING_LEVEL: ScannerThinkingLevel = 'medium';

export const SCAN_AI_KNOWN_MODELS = [
  { id: 'gemini-3.7-flash', label: '3.7 Flash' },
  { id: 'gemini-3.1-pro-preview', label: 'Pro' },
  { id: 'gemini-3.5-flash', label: '3.5 Flash' },
] as const;

export const SCAN_AI_THINKING_LEVELS: readonly ScannerThinkingLevel[] = [
  'minimal',
  'low',
  'medium',
  'high',
];
