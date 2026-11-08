import { ApiError } from '@smarteverything/domain';
import type { AiHarnessEvent } from '@smarteverything/domain';
import type { HarnessService } from '../../../harness/service';
import type { ActiveTurn } from './projector-types';

export class DeliveryCorrelation {
  private readonly claimed = new Map<string, number>();
  private readonly aliases = new Map<string, string>();

  constructor(
    private readonly service: HarnessService,
    private readonly active: ReadonlyMap<string, ActiveTurn>,
  ) {}

  continueAs(turn: ActiveTurn, deliveryId: string): void {
    this.aliases.set(deliveryId, turn.event.id);
    this.claimed.delete(turn.event.id);
  }

  retire(turn: ActiveTurn): void {
    this.claimed.delete(turn.event.id);
    for (const [alias, id] of this.aliases) if (id === turn.event.id) this.aliases.delete(alias);
  }

  turnOf(event: AiHarnessEvent): ActiveTurn | undefined {
    if (event.delivery_id === undefined) return this.legacyTurn(event);
    const turn = this.active.get(this.aliases.get(event.delivery_id) ?? event.delivery_id);
    if (turn !== undefined) {
      this.requireConversation(turn, event);
      this.requireClaimedTurn(turn, event);
    }
    return turn;
  }

  private requireConversation(turn: ActiveTurn, event: AiHarnessEvent): void {
    if (
      turn.chat.id !== event.chat_id ||
      this.service.binding(turn.chat).session_id !== event.session_id
    )
      throw new ApiError(
        'forbidden',
        'Native input correlation belongs to another shared conversation.',
      );
  }

  private legacyTurn(event: AiHarnessEvent): ActiveTurn | undefined {
    const turns = [...this.active.values()].filter((turn) => turn.chat.id === event.chat_id);
    if (turns.length > 1 && !['state', 'agent', 'interaction'].includes(event.kind))
      throw new ApiError(
        'conflict',
        'This host cannot correlate restored native input with its original delivery.',
      );
    const turn = turns.length === 1 ? turns[0] : undefined;
    if (turn === undefined || turn.restored) return undefined;
    const target = this.service.binding(turn.chat).execution_target;
    return this.service.directory.get(target).host.manifest?.delivery_correlation === true
      ? undefined
      : turn;
  }

  private requireClaimedTurn(turn: ActiveTurn, event: AiHarnessEvent): void {
    if (event.kind === 'completed' && event.input_discarded === true) {
      if (this.claimed.has(turn.event.id))
        throw new ApiError(
          'conflict',
          'A claimed native delivery cannot finish as discarded input.',
        );
      return;
    }
    if (event.native_turn === undefined)
      throw new ApiError('conflict', 'Correlated native input is missing its claimed turn.');
    const prior = this.claimed.get(turn.event.id);
    if (prior !== undefined && prior !== event.native_turn)
      throw new ApiError('conflict', 'Native delivery was already claimed by another turn.');
    if (event.kind === 'state') this.claimed.set(turn.event.id, event.native_turn);
    else if (prior !== event.native_turn)
      throw new ApiError('conflict', 'Native publication differs from its claimed delivery turn.');
  }
}
