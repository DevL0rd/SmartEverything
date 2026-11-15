import { memo, type ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { useContextMenu, type MenuItem } from '../../../components/menu';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { selectionTick } from '../../../platform/haptics';
import type { StepView } from './item-steps';
import { useItemOpen } from './selection';

export interface StepRowProps {
  readonly step: StepView;
  readonly disabled: boolean;
  readonly onDone: (step: StepView) => void;
  readonly onOutdent: ((step: StepView) => void) | null;
}

function StepCheck({ step, disabled, onDone }: Omit<StepRowProps, 'onOutdent'>): ReactNode {
  return (
    <Interactive
      role="checkbox"
      checked={step.done}
      label={`Done: ${step.item.title}`}
      disabled={disabled || step.done}
      onPress={() => {
        selectionTick();
        onDone(step);
      }}
      className="-mx-0.5 size-11 items-center justify-center rounded-md"
      layerClassName="rounded-md"
      focusInset
    >
      <View
        className={cn(
          'size-4.5 items-center justify-center rounded-full border-2',
          step.done ? 'border-primary bg-primary' : 'border-on-surface-variant',
        )}
      >
        {step.done ? <Icon name="check" size={12} tone="onPrimary" /> : null}
      </View>
    </Interactive>
  );
}

function outdentItemsOf(
  step: StepView,
  disabled: boolean,
  onOutdent: StepRowProps['onOutdent'],
): readonly MenuItem[] {
  if (onOutdent === null) return [];
  return [
    {
      id: 'outdent',
      label: 'Make it its own task',
      icon: 'listTree',
      disabled,
      onPress: (): void => {
        onOutdent(step);
      },
    },
  ];
}

function StepTitle({ step }: { readonly step: StepView }): ReactNode {
  const due = step.item.due_date;
  return (
    <View pointerEvents="none" className="min-w-0 flex-1 flex-row items-center gap-2">
      <Text
        variant="callout"
        tone={step.done ? 'variant' : 'default'}
        numberOfLines={2}
        className={cn('min-w-0 shrink', step.done && 'line-through')}
      >
        {step.item.title}
      </Text>
      {due === null && step.item.notes === '' ? null : (
        <Icon name={due === null ? 'fileText' : 'calendar'} size={12} tone="faint" />
      )}
    </View>
  );
}

function Row({ step, disabled, onDone, onOutdent }: StepRowProps): ReactNode {
  const open = useItemOpen(step.item.id, 'single');
  const menu = useContextMenu(outdentItemsOf(step, disabled, onOutdent), step.item.title);
  return (
    <View className="relative min-h-row-h justify-center">
      <Interactive
        {...open}
        label={`Open step ${step.item.title}`}
        onContextMenu={menu.onContextMenu}
        className="absolute inset-0"
      >
        {null}
      </Interactive>
      <View pointerEvents="box-none" className="min-h-row-h flex-row items-center gap-3.5 px-4">
        <StepCheck step={step} disabled={disabled} onDone={onDone} />
        <StepTitle step={step} />
      </View>
      {menu.host}
    </View>
  );
}

export const StepRow = memo(Row);
