import { createContext, useContext, useState } from 'react';
import type { AiChatRow, Engine } from '@smarteverything/domain';
import { useHarnessCatalogue } from '../data/harness';
import { machineSwitchOf } from '../model/harness-handoff';
import { recentIdOfNative, useRecentModels } from '../picker/panel/panel-recent';
import { useHarnessHostChoice } from '../provider/harness-host-choice';
import type { NativeModelRequest } from '../provider/subscription-models';

interface EngineAccessory {
  readonly chat: AiChatRow | undefined;
  readonly pending: NativeModelRequest | null;
  readonly request: (request: NativeModelRequest) => void;
  readonly cancel: () => void;
  readonly change: (engine: Engine) => void;
  readonly host: ReturnType<typeof useHarnessHostChoice>;
}
const EngineAccessoryContext = createContext<EngineAccessory | null>(null);
export const EngineAccessoryProvider = EngineAccessoryContext.Provider;
export function useEngineAccessory(): EngineAccessory | null {
  return useContext(EngineAccessoryContext);
}
export function useEngineControls(
  engine: Engine,
  onChange: (engine: Engine) => void,
  chat?: AiChatRow,
): EngineAccessory {
  const [pending, request] = useState<NativeModelRequest | null>(null);
  const catalogue = useHarnessCatalogue();
  const recent = useRecentModels();
  const host = useHarnessHostChoice(
    catalogue.data,
    engine.kind === 'dsh' ? engine.execution_target : null,
    chat === undefined,
  );
  return {
    chat,
    pending,
    request,
    host,
    cancel: (): void => {
      request(null);
    },
    change: (next: Engine): void => {
      if (pending !== null) recent.record(recentIdOfNative(pending));
      request(null);
      onChange(next);
    },
  };
}
export function useMachineSwitchPending(chat: AiChatRow | undefined): boolean {
  return machineSwitchOf(chat?.pending_execution_target).kind === 'pending';
}
