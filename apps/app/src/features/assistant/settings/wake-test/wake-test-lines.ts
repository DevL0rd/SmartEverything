import type { WakeTestLine } from '@smarteverything/domain';
import { ValueStore } from '../../../../design/external-store';

const KEPT_LINES = 30;

export const wakeTestLines = new ValueStore<readonly WakeTestLine[]>([]);

export function receiveWakeTestLine(line: WakeTestLine): void {
  wakeTestLines.update((lines) => [line, ...lines].slice(0, KEPT_LINES));
}

export function clearWakeTestLines(): void {
  wakeTestLines.set([]);
}
