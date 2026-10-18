import { randomUUID } from 'node:crypto';
import { Logger, background, messageOf } from '@smarteverything/logging';
import {
  announceMachine,
  applyPendingMachine,
  noteMachineChange,
} from '../../../harness/pending-machine';
import type { HarnessService } from '../../../harness/service';
import type { AiChatRow } from '@smarteverything/domain';
import type { NativeCompletion } from './completion';

const log = new Logger('hub.harness');
const CONTINUE = 'Continue the work you were doing.';

export interface MovableTurn {
  readonly chat: Pick<AiChatRow, 'id' | 'profile_id'>;
}

export interface MovableTurns<T extends MovableTurn> {
  readonly hold: (turn: T) => void;
  readonly release: (turn: T) => void;
  readonly continueAs: (turn: T, deliveryId: string) => void;
  readonly complete: (turn: T, event: NativeCompletion) => void;
}

export class TurnMachineMoves<T extends MovableTurn> {
  private readonly moving = new Set<string>();
  constructor(
    private readonly service: HarnessService,
    private readonly turns: MovableTurns<T>,
  ) {}

  moves(chatId: string): boolean {
    return this.moving.has(chatId);
  }

  atToolCall(turn: T): void {
    const id = turn.chat.id;
    if (this.moving.has(id)) return;
    if (this.service.store.aiChats.chat(id).pending_execution_target === null) return;
    this.moving.add(id);
    this.turns.hold(turn);
    background(
      this.moveInTurn(turn)
        .catch((cause: unknown) => {
          log.error('machine_move.failed', cause, { chat_id: id });
          this.turns.complete(turn, {
            kind: 'failed',
            failure: {
              code: 'operation_failed',
              message: messageOf(cause).slice(0, 2000),
              retry_at: null,
            },
          });
        })
        .finally(() => {
          this.moving.delete(id);
        }),
      'in_turn.move_failed',
    );
  }

  async atTurnEnd(chatId: string): Promise<void> {
    try {
      const outcome = await applyPendingMachine(this.service, chatId, false);
      if (outcome?.state === 'moved') await noteMachineChange(this.service, chatId, outcome.note);
      else if (outcome !== undefined) log.warn('machine_move.not_applied', { chat_id: chatId });
    } catch (cause) {
      log.error('machine_move.failed', cause, { chat_id: chatId });
    }
  }

  private async moveInTurn(turn: T): Promise<void> {
    const chatId = turn.chat.id;
    const outcome = await applyPendingMachine(this.service, chatId, true);
    if (outcome === undefined) {
      this.turns.release(turn);
      return;
    }
    if (outcome.state === 'stranded') throw new Error(outcome.reason);
    if (outcome.state === 'moved') announceMachine(this.service, chatId);
    const deliveryId = randomUUID();
    this.turns.continueAs(turn, deliveryId);
    const session = this.service.state({ profileId: turn.chat.profile_id, role: 'member' }, chatId);
    if (session.epoch === null) throw new Error('The chat has no open session to continue.');
    await this.service.directory.execute(session.target, randomUUID(), {
      kind: 'prompt',
      session_id: session.session_id,
      expected_epoch: session.epoch,
      delivery_id: deliveryId,
      text: `${outcome.note} ${CONTINUE}`,
      attachments: [],
    });
  }
}
