import { z } from 'zod';
import { ID } from './api/primitives';
import type { CommandStatus } from './commands';
import type { SkippedGroupDevice } from './device-group-commands';

export const SKIP_REASON = z.enum(['offline', 'unsupported', 'removed', 'off']);
export type SkipReason = z.infer<typeof SKIP_REASON>;

export const FAILURE_REASON = z.enum(['no_response', 'refused', 'error']);
export type FailureReason = z.infer<typeof FAILURE_REASON>;

export const SKIPPED_MEMBER = z.strictObject({
  deviceId: ID,
  reason: SKIP_REASON,
  detail: z.string().min(1).optional(),
});

export const MEMBER_OUTCOME = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('changed'), deviceId: ID }),
  z.strictObject({ status: z.literal('pending'), deviceId: ID }),
  z.strictObject({
    status: z.literal('skipped'),
    deviceId: ID,
    reason: SKIP_REASON,
    detail: z.string().min(1).optional(),
  }),
  z.strictObject({
    status: z.literal('failed'),
    deviceId: ID,
    reason: FAILURE_REASON,
    detail: z.string().min(1).optional(),
  }),
]);
export type MemberOutcome = z.infer<typeof MEMBER_OUTCOME>;

export type ResultNoun = 'light' | 'device';

export interface CommandResult {
  readonly device_id: string | null;
  readonly status: CommandStatus;
  readonly error: string | null;
}

const SKIP_TEXT: Readonly<Record<SkipReason, string>> = {
  offline: 'Offline',
  unsupported: 'Not supported',
  removed: 'No longer exists',
  off: 'Off',
};

const FAILURE_TEXT: Readonly<Record<FailureReason, string>> = {
  no_response: "Didn't respond",
  refused: 'Refused the change',
  error: 'Something went wrong',
};

export function skippedText(skip: {
  readonly reason: SkipReason;
  readonly detail?: string | undefined;
}): string {
  return skip.detail ?? SKIP_TEXT[skip.reason];
}

export function memberOutcomeText(outcome: MemberOutcome): string {
  switch (outcome.status) {
    case 'changed':
      return 'Changed';
    case 'pending':
      return 'Waiting';
    case 'skipped':
      return skippedText(outcome);
    case 'failed':
      return outcome.detail === undefined
        ? FAILURE_TEXT[outcome.reason]
        : `${FAILURE_TEXT[outcome.reason]}: ${outcome.detail}`;
  }
}

export function memberOutcomeLine(name: string, outcome: MemberOutcome): string {
  return `${name}: ${memberOutcomeText(outcome)}`;
}

function failedToChange(outcome: MemberOutcome): boolean {
  if (outcome.status === 'failed') return true;
  return (
    outcome.status === 'skipped' && (outcome.reason === 'offline' || outcome.reason === 'removed')
  );
}

function counted(count: number, noun: ResultNoun): string {
  return `${String(count)} ${count === 1 ? noun : `${noun}s`}`;
}

export function targetResultHeadline(
  outcomes: readonly MemberOutcome[],
  noun: ResultNoun,
): string | null {
  const unchanged = outcomes.filter(failedToChange).length;
  const waiting = outcomes.filter((outcome) => outcome.status === 'pending').length;
  const parts = [
    ...(unchanged === 0 ? [] : [`${counted(unchanged, noun)} didn't change`]),
    ...(waiting === 0 ? [] : [`${String(waiting)} still waiting`]),
  ];
  return parts.length === 0 ? null : parts.join(' · ');
}

export function retryable(outcomes: readonly MemberOutcome[]): readonly string[] {
  return outcomes.flatMap((outcome) => (outcome.status === 'failed' ? [outcome.deviceId] : []));
}

export function commandOutcome(command: CommandResult): MemberOutcome | null {
  if (command.device_id === null) return null;
  const deviceId = command.device_id;
  switch (command.status) {
    case 'succeeded':
      return { status: 'changed', deviceId };
    case 'pending':
    case 'running':
      return { status: 'pending', deviceId };
    case 'expired':
      return { status: 'failed', deviceId, reason: 'no_response' };
    case 'failed':
      return {
        status: 'failed',
        deviceId,
        reason: 'refused',
        ...(command.error === null || command.error === '' ? {} : { detail: command.error }),
      };
  }
}

export function memberOutcomes(
  skipped: readonly SkippedGroupDevice[],
  commands: readonly CommandResult[],
): readonly MemberOutcome[] {
  return [
    ...skipped.map((skip) => ({ status: 'skipped' as const, ...skip })),
    ...commands.flatMap((command) => {
      const outcome = commandOutcome(command);
      return outcome === null ? [] : [outcome];
    }),
  ];
}
