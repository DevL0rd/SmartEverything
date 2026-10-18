import type { Engine } from '@smarteverything/domain';
import { useIsOwner } from '../../../../store/selectors';
import { stopChat } from '../../chats/chat-actions';
import { useEngineAccessory } from '../../chats/engine-accessories';
import { useModelPickAuthority } from '../../chats/model-pick-authority';
import { useChatWorking } from '../../data/chat-store';
import { isComputerEngine } from '../../provider/computer-engine';
import { engineOf, pickOf } from '../library/library-pick';
import type { ModelPickerProps } from '../../data/model-candidates';
import { usePickerSession } from '../model-search-session';
import { panelReasonOf, type PanelReason } from './panel-reason';
import { recentIdOf, useRecentModels } from './panel-recent';
import { background } from '@smarteverything/logging';

export const STALE_NOTE = 'The list changed. Pick again.';

export interface PanelPickerInput {
  readonly engine: Engine;
  readonly onChange: (engine: Engine) => void;
  readonly blocked: boolean;
  readonly close: () => void;
  readonly onStale: () => void;
}

export interface PanelPicker {
  readonly picker: ModelPickerProps;
  readonly change: (engine: Engine) => void;
  readonly editable: boolean;
  readonly reason: PanelReason | null;
  readonly stop: (() => void) | null;
}

function useStop(blocked: boolean): (() => void) | null {
  const chat = useEngineAccessory()?.chat;
  const working = useChatWorking(chat?.id ?? '');
  if (!blocked || !working || chat === undefined) return null;
  return (): void => {
    background(stopChat(chat.id), 'chat.stop_failed');
  };
}

interface PickerParts {
  readonly engine: Engine;
  readonly editable: boolean;
  readonly guarded: (action: () => void) => void;
  readonly onChange: (engine: Engine) => void;
  readonly close: () => void;
}

function usePicker(parts: PickerParts): ModelPickerProps {
  const { engine, editable, guarded, onChange, close } = parts;
  const accessory = useEngineAccessory();
  const recent = useRecentModels();
  if (!editable) return { picked: pickOf(engine), onPick: null };
  return {
    picked: pickOf(engine),
    onPick: (pick): void => {
      guarded(() => {
        recent.record(recentIdOf(pick));
        onChange(engineOf(pick));
        close();
      });
    },
    onNativeNeeded:
      accessory === null
        ? undefined
        : (request): void => {
            guarded(() => {
              accessory.request(request);
              close();
            });
          },
  };
}

export function usePanelPicker(input: PanelPickerInput): PanelPicker {
  const { engine, onChange, blocked, close, onStale } = input;
  const valid = useModelPickAuthority({ engine, blocked });
  const owner = useIsOwner();
  const session = usePickerSession();
  const readOnly = isComputerEngine(engine) && !owner;
  const editable = !blocked && !readOnly && session.ready;
  const guarded = (action: () => void): void => {
    if (valid()) action();
    else onStale();
  };
  const picker = usePicker({ engine, editable, guarded, onChange, close });
  const stop = useStop(blocked);
  return {
    picker,
    change: (next): void => {
      guarded(() => {
        onChange(next);
      });
    },
    editable,
    reason: panelReasonOf({ blocked, readOnly, ready: session.ready }),
    stop: readOnly ? null : stop,
  };
}
