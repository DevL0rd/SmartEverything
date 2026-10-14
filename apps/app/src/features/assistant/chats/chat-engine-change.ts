import { randomUUID } from 'expo-crypto';
import {
  harnessTargetKey,
  type AiChatRow,
  type Engine,
  type AiHarnessSession,
  type AiModelRoute,
  type DshEngine,
  type AiHarnessHandoffRequest,
} from '@smarteverything/domain';
import { notify } from '../../../components/toast-store';
import { useChatHarness, useHarnessCatalogue, useHarnessSwitch } from '../data/harness';
import { harnessHandoffWaiting } from '../model/harness-handoff';
import { changeChat } from './chat-actions';

export function useChatEngineChange(chat: AiChatRow): (engine: Engine) => void {
  const bound = chat.engine.kind === 'dsh' && chat.engine.session_id !== null;
  const session = useChatHarness(chat.id, bound);
  const catalogue = useHarnessCatalogue();
  const change = useHarnessSwitch(chat.id);
  return (engine): void => {
    if (!bound) {
      void changeChat(chat.id, { engine });
      return;
    }
    if (engine.kind !== 'dsh') {
      notify({
        message: 'Start a new chat to use another engine. This chat keeps its native history.',
        tone: 'default',
      });
      return;
    }
    const current = session.data;
    const route = catalogue.data?.routes.find((item) => item.id === engine.model_route_id);
    if (
      current?.epoch === null ||
      current === undefined ||
      harnessHandoffWaiting(current) ||
      route === undefined ||
      change.isPending
    ) {
      notify({
        message: 'Wait for the current host change to finish, then choose the model again.',
        tone: 'default',
      });
      return;
    }
    change.mutate(changeIntent(current, current.epoch, route, engine), {
      onError: (error): void => {
        notify({ message: 'Model not changed', error, tone: 'critical' });
      },
    });
  };
}

function changeIntent(
  current: AiHarnessSession,
  epoch: number,
  route: AiModelRoute,
  engine: DshEngine,
): AiHarnessHandoffRequest {
  return {
    operation_id: randomUUID(),
    expected_epoch: epoch,
    target: engine.execution_target,
    mode: 'drain',
    route: {
      route_id: route.id,
      capability_revision: route.capability_revision,
      model: engine.model,
      effort: engine.effort,
    },
    ...(current.directory === null ||
    harnessTargetKey(current.target) !== harnessTargetKey(engine.execution_target)
      ? {}
      : { directory: current.directory }),
  };
}
