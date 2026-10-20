import { randomUUID } from 'node:crypto';
import type { CommandRow, SignalInput } from '@smarteverything/domain';
import type { EffectRun } from '../../../src/automations/effects/effect-run';

export interface TestRun extends EffectRun {
  readonly controller: AbortController;
  readonly recorded: CommandRow[];
}

export function testRun(trigger: SignalInput | null = null): TestRun {
  const controller = new AbortController();
  const recorded: CommandRow[] = [];
  return {
    runId: randomUUID(),
    automationId: randomUUID(),
    signal: controller.signal,
    trigger,
    controller,
    recorded,
    commands: (rows): void => {
      recorded.push(...rows);
    },
  };
}

export function triggerWithDepth(depth: number): SignalInput {
  return {
    source: 'device',
    kind: 'state',
    subject: null,
    field: null,
    value: true,
    previous: null,
    at: '2026-10-08T12:00:00.000Z',
    profileId: null,
    data: { causeDepth: depth },
  };
}
