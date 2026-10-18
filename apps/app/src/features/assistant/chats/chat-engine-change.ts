import { randomUUID } from 'expo-crypto';
import { Logger, background } from '@smarteverything/logging';
import type {
  AiChatRow,
  AiHarnessHandoffRequest,
  AiHarnessSwitchResult,
  DshEngine,
  Engine,
} from '@smarteverything/domain';
import { notify } from '../../../components/toast-store';
import { useChatHarness, useHarnessCatalogue, useHarnessSwitch } from '../data/harness';
import { machineSwitchRequest } from '../model/harness-handoff';
import { modelIdName } from '../model/model-name';
import { isNativeKey } from '../picker/library/library-sources';
import { isComputerEngine } from '../provider/computer-engine';
import { useEngineCatalogue } from '../provider/provider-data';
import { continueInBranch } from './branch';
import { changeChat } from './chat-actions';

const log = new Logger('app.chat');

export type EngineChange = 'direct' | 'handoff' | 'branch';

function boundToHarness(engine: Engine): boolean {
  return engine.kind === 'dsh' && engine.session_id !== null;
}

export function engineChangeOf(current: Engine, next: Engine): EngineChange {
  if (!boundToHarness(current)) return 'direct';
  return next.kind === 'dsh' ? 'handoff' : 'branch';
}

export function branchesOnPick(current: Engine, candidateKey: string): boolean {
  return boundToHarness(current) && isNativeKey(candidateKey);
}

interface NamedComputer {
  readonly runtime: string;
  readonly device_id: string;
  readonly models: readonly { readonly id: string; readonly name: string }[];
}

export function branchModelName(
  engine: Engine,
  computers: readonly NamedComputer[] | undefined,
): string {
  const native = isComputerEngine(engine)
    ? computers
        ?.find((row) => row.runtime === engine.kind && row.device_id === engine.device_id)
        ?.models.find((row) => row.id === engine.model)?.name
    : undefined;
  return native ?? modelIdName(engine.model);
}

export interface HandoffOptions {
  readonly directory?: AiHarnessHandoffRequest['directory'];
  readonly failure?: string;
  readonly onSuccess?: (result: AiHarnessSwitchResult) => void;
}

export function useChatHandoff(
  chat: AiChatRow,
): (engine: DshEngine, options?: HandoffOptions) => void {
  const session = useChatHarness(chat.id, boundToHarness(chat.engine));
  const catalogue = useHarnessCatalogue();
  const change = useHarnessSwitch(chat.id);
  return (engine, options = {}): void => {
    const route = catalogue.data?.routes.find((item) => item.id === engine.model_route_id);
    if (route === undefined || change.isPending) {
      log.warn('engine.handoff_skipped', {
        chatId: chat.id,
        routeKnown: route !== undefined,
        pending: change.isPending,
      });
      notify({ message: 'Wait a moment, then choose again.', tone: 'default' });
      return;
    }
    const request = machineSwitchRequest({
      engine,
      route,
      session: session.data,
      operationId: randomUUID(),
    });
    const { directory, onSuccess, failure = 'Model not changed' } = options;
    const startedAt = Date.now();
    log.info('engine.handoff_started', {
      chatId: chat.id,
      routeId: engine.model_route_id,
      hasDirectory: directory !== undefined,
    });
    change.mutate(directory === undefined ? request : { ...request, directory }, {
      onSuccess: (result): void => {
        log.info('engine.handoff_succeeded', {
          chatId: chat.id,
          routeId: engine.model_route_id,
          durationMs: Date.now() - startedAt,
        });
        onSuccess?.(result);
      },
      onError: (error): void => {
        log.error('engine.handoff_failed', error, {
          chatId: chat.id,
          routeId: engine.model_route_id,
          durationMs: Date.now() - startedAt,
        });
        notify({ message: failure, error, tone: 'critical' });
      },
    });
  };
}

export function useChatEngineChange(chat: AiChatRow): (engine: Engine) => void {
  const engines = useEngineCatalogue();
  const handoff = useChatHandoff(chat);
  return (engine): void => {
    const kind = engineChangeOf(chat.engine, engine);
    log.info('engine.change_requested', {
      chatId: chat.id,
      change: kind,
      from: chat.engine.kind,
      to: engine.kind,
    });
    if (kind === 'branch') {
      background(
        continueInBranch(chat.id, engine, branchModelName(engine, engines.data?.computers)),
        'in_branch.continue_failed',
      );
      return;
    }
    if (kind === 'direct' || engine.kind !== 'dsh') {
      background(changeChat(chat.id, { engine }), 'chat.change_failed');
      return;
    }
    handoff(engine);
  };
}
