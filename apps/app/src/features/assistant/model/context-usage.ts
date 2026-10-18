import { harnessContextPercent, type AiHarnessSession } from '@smarteverything/domain';

export interface ContextUsage {
  readonly percent: number | null;
  readonly label: string;
  readonly capacity: number | null;
}

export function contextUsage(
  context: AiHarnessSession['context'],
  fallback: number | null,
  native: boolean,
): ContextUsage {
  const percent = context === undefined ? fallback : harnessContextPercent(context);
  return {
    percent: percent === null ? null : Math.round(percent),
    label: contextLabel(context, native),
    capacity: context?.capacity_tokens ?? null,
  };
}

function contextLabel(context: AiHarnessSession['context'], native: boolean): string {
  if (context?.state === 'compacting') return 'Compacting · last request';
  if (context?.state === 'stale')
    return context.estimate_tokens !== undefined && context.estimate_tokens !== null
      ? 'Context estimate'
      : 'Last request';
  return context === undefined && native ? 'Last request' : 'Context';
}
