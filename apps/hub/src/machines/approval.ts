import {
  MACHINE_APPROVAL_SECONDS,
  type MachineAction,
  type PhoneActionResult,
  type PhoneApproval,
} from '@smarteverything/domain';
import { effectiveRow } from '../server/person-access';
import type { Logger } from '@smarteverything/logging';
import type { PushCommandChannel } from '../extensions/push/commands';
import { PushAsks } from '../local/push-asks';
import type { Store } from '../store/store';

const MILLISECONDS = 1000;

export class MachineApprovalDeniedError extends Error {
  override readonly name = 'MachineApprovalDeniedError';

  constructor(
    readonly action: MachineAction,
    readonly detail: string,
  ) {
    super(detail);
  }
}

export interface ApprovalRequest extends PhoneApproval {
  readonly profileId: string | null;
}

export function approverClients(
  store: Pick<Store, 'clients' | 'profiles' | 'personAccess'>,
  profileId: string | null,
): readonly string[] {
  const phones = store.clients.list().filter((client) => client.platform === 'android');
  const own = phones.filter(
    (client) => profileId !== null && store.profiles.activeOf(client.id).id === profileId,
  );
  return (
    own.length > 0 ? own : phones.filter((client) => effectiveRow(store, client).role === 'owner')
  ).map((client) => client.id);
}

export class MachineApprovals {
  private readonly asks: PushAsks<PhoneActionResult>;

  constructor(
    push: PushCommandChannel,
    private readonly store: Pick<Store, 'clients' | 'profiles' | 'personAccess'>,
    private readonly log: Logger,
  ) {
    this.asks = new PushAsks('approval', push);
  }

  async require(request: ApprovalRequest): Promise<void> {
    const { profileId, ...approval } = request;
    const clients = approverClients(this.store, profileId);
    const result = await this.asks.ask({
      command: 'machine_approval',
      settledCommand: 'machine_approval_cancel',
      clients,
      payload: { approval },
      timeoutMs: MACHINE_APPROVAL_SECONDS * MILLISECONDS,
      sent: ({ asked, reached }) => {
        this.log.info('machine.approval_asked', {
          action: approval.action,
          source: approval.source,
          asked,
          reached,
        });
      },
      unreachable: () => ({
        ok: false,
        detail: `Nobody could be asked to approve ${approval.action.replaceAll('_', ' ')} on ${approval.machine}: no phone could be reached.`,
      }),
      unanswered: () => ({
        ok: false,
        detail: `Nobody approved ${approval.action.replaceAll('_', ' ')} on ${approval.machine} within ${String(MACHINE_APPROVAL_SECONDS)} s.`,
      }),
    });
    if (!result.ok) {
      this.log.warn('machine.approval_denied', {
        action: approval.action,
        source: approval.source,
      });
      throw new MachineApprovalDeniedError(approval.action, result.detail);
    }
  }

  has(requestId: string): boolean {
    return this.asks.has(requestId);
  }

  answer(clientId: string, requestId: string, result: PhoneActionResult): void {
    this.asks.answer(clientId, requestId, result);
    this.log.info('machine.approval_answered', { by: clientId, ok: result.ok });
  }

  stop(): void {
    this.asks.stop({ ok: false, detail: 'The server is stopping.' });
  }
}
