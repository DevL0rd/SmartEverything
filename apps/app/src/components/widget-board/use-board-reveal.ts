import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import type { BoardWidget } from '@smarteverything/domain';
import { revealPlan, type BoardReveal } from './reveal';

export function useBoardReveal(
  widgets: readonly BoardWidget[],
  reveal: BoardReveal | undefined,
): BoardReveal | null {
  const router = useRouter();
  const plan = reveal === undefined ? null : revealPlan(widgets, reveal);
  const kind = plan?.kind ?? null;
  const widget = plan?.kind === 'page' ? plan.widget : null;
  useEffect(() => {
    if (reveal === undefined || kind === null || kind === 'ring') {
      return;
    }
    reveal.onDone();
    const page = widget === null ? null : reveal.pageOf(widget);
    if (page !== null) {
      router.push(page);
    }
  }, [reveal, kind, widget, router]);
  return kind === 'ring' && reveal !== undefined ? reveal : null;
}
