import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { AiChatRow, Engine } from '@smarteverything/domain';
import { useHarnessCatalogue } from '../data/harness';
import { useHarnessHostChoice } from '../provider/harness-host-choice';
import type { NativeModelRequest } from '../provider/subscription-models';
import { DeviceChip, DraftDeviceChip, NativeDeviceChip } from './device-chip';
import { isComputerEngine } from '../provider/computer-engine';

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
  const host = useHarnessHostChoice(
    catalogue.data,
    engine.kind === 'dsh' ? engine.execution_target : null,
    chat === undefined,
  );
  return useMemo(
    () => ({
      chat,
      pending,
      request,
      host,
      cancel: (): void => {
        request(null);
      },
      change: (next: Engine): void => {
        request(null);
        onChange(next);
      },
    }),
    [pending, host, onChange, chat],
  );
}
export function ChatDeviceControl({
  engine,
  chat,
  blocked = false,
}: {
  readonly engine: Engine;
  readonly chat?: AiChatRow;
  readonly blocked?: boolean;
}): ReactNode {
  const control = useEngineAccessory();
  if (control === null) return null;
  if (control.pending !== null || isComputerEngine(engine))
    return <NativeDeviceChip engine={engine} blocked={blocked} />;
  return chat === undefined ? (
    <DraftDeviceChip engine={engine} onChange={control.change} />
  ) : (
    <DeviceChip chat={chat} />
  );
}
