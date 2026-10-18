import { Logger, background } from '@smarteverything/logging';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  ApiError,
  AI_HARNESS_ENDPOINTS as E,
  type AiSubscriptionHostStatus,
  type AiSubscriptionProvider,
  type AI_SUBSCRIPTION_COMMAND,
} from '@smarteverything/domain';
import type { z } from 'zod';
import { api } from '../../../api/transport';
import { subscriptionInteractionIdentity } from '../model/subscription';
import { HARNESS_CATALOGUE_KEY } from '../../../queries/harness-notices';

const log = new Logger('app.computers');
type Command = z.infer<typeof AI_SUBSCRIPTION_COMMAND>;
interface Binding {
  readonly deviceId: string;
  readonly provider: AiSubscriptionProvider;
  readonly profileId: string;
  readonly changed: (status: AiSubscriptionHostStatus) => void;
}
export interface SubscriptionControl {
  readonly status: AiSubscriptionHostStatus | null;
  readonly pending: boolean;
  readonly acknowledged: boolean;
  readonly error: string | null;
  readonly completed: Command['kind'] | null;
  readonly inputRevision: number;
  readonly control: (command: Command) => Promise<void>;
}
function bound(status: AiSubscriptionHostStatus, binding: Binding): boolean {
  return (
    status.profile_id === binding.profileId &&
    status.provider === binding.provider &&
    status.route.supplier.kind === 'device' &&
    status.route.supplier.device_id === binding.deviceId
  );
}
function subscriptionError(error: unknown): string {
  if (error instanceof ApiError && ['conflict', 'forbidden', 'not_found'].includes(error.code))
    return error.message;
  return 'Subscription action could not be completed. Check the computer connection and try again.';
}
function useAlive(): () => boolean {
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    return (): void => {
      active.current = false;
    };
  }, []);
  return (): boolean => active.current;
}
interface ControlTrace {
  readonly startedAt?: number | undefined;
  readonly error?: unknown;
}

function logControl(
  event: string,
  binding: Binding,
  command: Command,
  trace: ControlTrace = {},
): void {
  const { startedAt, error } = trace;
  const payload = {
    deviceId: binding.deviceId,
    provider: binding.provider,
    command: command.kind,
    ...(startedAt === undefined ? {} : { durationMs: Date.now() - startedAt }),
  };
  if (error === undefined) log.info(event, payload);
  else log.error(event, error, payload);
}
function rejectAnswer(binding: Binding, command: Command, setError: (text: string) => void): void {
  logControl('subscription.answer_rejected', binding, command);
  setError('This sign-in prompt was answered or changed. Check status for the next step.');
}
function refreshCatalogue(client: QueryClient): void {
  background(
    client.invalidateQueries({ queryKey: HARNESS_CATALOGUE_KEY }),
    'catalogue.invalidate_failed',
  );
}
export function useSubscriptionControl(binding: Binding): SubscriptionControl {
  const client = useQueryClient();
  const [status, setStatus] = useState<AiSubscriptionHostStatus | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState<Command['kind'] | null>(null);
  const [inputRevision, setInputRevision] = useState(0);
  const [acknowledgement, setAcknowledgement] = useState<string | null>(null);
  const accepted = useRef<string | null>(null);
  const alive = useAlive();
  const busy = useRef(false);
  const control = async (command: Command): Promise<void> => {
    if (busy.current || !alive()) return;
    const identity = answerIdentity(command, status);
    if (!answerAdmitted(command, identity, accepted.current)) {
      rejectAnswer(binding, command, setError);
      return;
    }
    if (command.kind !== 'status') setInputRevision((revision) => revision + 1);
    const startedAt = Date.now();
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await subscriptionResponse(binding, command);
      if (!alive()) return;
      accepted.current = nextAcknowledgement({
        command,
        identity,
        accepted: accepted.current,
        result,
      });
      setAcknowledgement(accepted.current);
      logControl('subscription.control_succeeded', binding, command, { startedAt });
      setStatus(result);
      setCompleted(command.kind);
      binding.changed(result);
      refreshCatalogue(client);
    } catch (error) {
      logControl('subscription.control_failed', binding, command, { startedAt, error });
      if (alive()) setError(subscriptionError(error));
    } finally {
      busy.current = false;
      if (alive()) setPending(false);
    }
  };
  useSubscriptionRefresh(control);
  const acknowledged = acknowledgedStatus(status, acknowledgement);
  return { status, pending, error, completed, inputRevision, control, acknowledged };
}

function nextAcknowledgement({
  command,
  identity,
  accepted,
  result,
}: {
  readonly command: Command;
  readonly identity: string | null;
  readonly accepted: string | null;
  readonly result: AiSubscriptionHostStatus;
}): string | null {
  const receipt = command.kind === 'answer' ? identity : accepted;
  return receipt === subscriptionInteractionIdentity(result.interaction) ? receipt : null;
}
function answerAdmitted(
  command: Command,
  identity: string | null,
  accepted: string | null,
): boolean {
  return command.kind !== 'answer' || (identity !== null && identity !== accepted);
}
function acknowledgedStatus(
  status: AiSubscriptionHostStatus | null,
  acknowledgement: string | null,
): boolean {
  return (
    acknowledgement !== null &&
    acknowledgement === subscriptionInteractionIdentity(status?.interaction ?? null)
  );
}
function answerIdentity(command: Command, status: AiSubscriptionHostStatus | null): string | null {
  const interaction = status?.interaction ?? null;
  if (command.kind !== 'answer' || interaction === null) return null;
  return interaction.enrollment_id === command.enrollment_id
    ? subscriptionInteractionIdentity(interaction)
    : null;
}
async function subscriptionResponse(
  binding: Binding,
  command: Command,
): Promise<AiSubscriptionHostStatus> {
  const result = await api().call(E.controlAiHarnessSubscription, {
    body: {
      target: { kind: 'device', device_id: binding.deviceId },
      provider: binding.provider,
      command,
    },
  });
  if (!bound(result, binding))
    throw new Error('This sign-in is for another profile or computer. Start sign-in again.');
  return result;
}
function useSubscriptionRefresh(control: (command: Command) => Promise<void>): void {
  const latest = useRef(control);
  useEffect(() => {
    latest.current = control;
  }, [control]);
  useEffect(() => {
    background(latest.current({ kind: 'status' }), 'latest.current_failed');
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active')
        background(latest.current({ kind: 'status' }), 'latest.current_failed');
    });
    const refresh = (): void => {
      background(latest.current({ kind: 'status' }), 'latest.current_failed');
    };
    if (typeof window !== 'undefined') window.addEventListener('focus', refresh);
    return (): void => {
      listener.remove();
      if (typeof window !== 'undefined') window.removeEventListener('focus', refresh);
    };
  }, []);
}
