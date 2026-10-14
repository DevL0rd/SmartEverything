import { useCommandTransient, openCommandPicker } from '../commands/transient';
import { isComputerEngine } from '../provider/computer-engine';
import type { ReactNode, RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { View } from 'react-native';
import type { Engine } from '@smarteverything/domain';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { useIsOwner } from '../../../store/selectors';
import { NATIVE_OWNER_REASON } from '../provider/provider-access';
import { useComposerAccessoryLayout } from '../components/composer-accessory-layout';
import { CompactPickerControl } from '../components/compact-picker-control';
import { useChatModel } from './chat-model';
import { ChatModelPicker } from './chat-model-picker';
import { measureAnchor, type Rect } from '../../../components/anchor';
import { QuickModelMenu } from './quick-model-menu';
import { useEngineAccessory } from './engine-accessories';
import { useModelMenuAnchor, focusModelTrigger } from './model-menu-anchor';

export function EngineSheet({
  open,
  onClose,
  engine,
  onChange,
  blocked = false,
  initialQuery,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly engine: Engine;
  readonly onChange: (engine: Engine) => void;
  readonly blocked?: boolean;
  readonly initialQuery?: string;
}): ReactNode {
  const accessory = useEngineAccessory();
  const owner = useIsOwner();
  const editable = !blocked && (!isComputerEngine(engine) || owner);
  return (
    <Sheet open={open} onClose={onClose} title="Model" detents={['full']} scroll={false}>
      <>
        {editable ? null : (
          <Text tone="variant">
            {blocked ? 'Stop active work before changing its model.' : NATIVE_OWNER_REASON}
          </Text>
        )}
        <ChatModelPicker
          engine={engine}
          onChange={editable ? onChange : null}
          {...(initialQuery === undefined ? {} : { initialQuery })}
          onNativeNeeded={
            accessory === null || !editable
              ? undefined
              : (request): void => {
                  accessory.request(request);
                  onClose();
                }
          }
        />
      </>
    </Sheet>
  );
}

export function ModelChip({
  engine,
  onChange,
  blocked = false,
}: {
  readonly engine: Engine;
  readonly onChange: (engine: Engine) => void;
  readonly blocked?: boolean;
}): ReactNode {
  const ref = useRef<View>(null);
  const [anchor, setAnchor] = useState<Rect | null>(null);
  usePendingMachine(ref, setAnchor);
  useModelMenuAnchor(ref, anchor, setAnchor);
  const model = useChatModel(engine);
  const layout = useComposerAccessoryLayout();
  const close = (): void => {
    setAnchor(null);
    focusModelTrigger(ref);
  };
  const dismissCommands = useCommandTransient(close);
  const value = modelChipValue(model, layout);
  return (
    <>
      <CompactPickerControl
        anchorRef={ref}
        label={`Model and thinking: ${model.name}, ${model.effort ?? 'Default'}`}
        value={value}
        icon="brain"
        onPress={(): void => {
          openCommandPicker(dismissCommands, ref, setAnchor);
        }}
      />
      <QuickModelMenu
        engine={engine}
        onChange={onChange}
        blocked={blocked}
        anchor={anchor}
        close={close}
      />
    </>
  );
}

function usePendingMachine(ref: RefObject<View | null>, show: (anchor: Rect) => void): void {
  const accessory = useEngineAccessory();
  const pending = accessory?.pending;
  useEffect(() => {
    if (pending !== undefined && pending !== null) measureAnchor(ref, show);
  }, [pending, ref, show]);
}

function modelChipValue(
  model: ReturnType<typeof useChatModel>,
  layout: ReturnType<typeof useComposerAccessoryLayout>,
): string {
  if (layout.compact && model.shortName.length * 7 > layout.modelLabelWidth) {
    const fallback = model.effort ?? 'Model';
    return fallback.length * 7 <= layout.modelLabelWidth ? fallback : '';
  }
  if (layout.compact || model.effort === null) return model.shortName;
  return `${model.shortName} · ${model.effort}`;
}
