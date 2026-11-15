import { memo, type ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { Interactive } from '../../../components/interactive';
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
      className="-m-2 size-11 items-center justify-center rounded-md"
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

function StepTitle({ step }: { readonly step: StepView }): ReactNode {
  const open = useItemOpen(step.item.id, 'single');
  const due = step.item.due_date;
  return (
    <Interactive
      {...open}
      label={`Open step ${step.item.title}`}
      className="min-h-11 min-w-0 flex-1 flex-row items-center gap-2 rounded-sm"
      layerClassName="rounded-sm"
    >
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
    </Interactive>
  );
}

function Row({ step, disabled, onDone, onOutdent }: StepRowProps): ReactNode {
  return (
    <View className="min-h-11 flex-row items-center gap-2 pr-1">
      <StepCheck step={step} disabled={disabled} onDone={onDone} />
      <StepTitle step={step} />
      {onOutdent === null ? null : (
        <IconButton
          icon="arrowLeft"
          label={`Make “${step.item.title}” its own task`}
          size="control"
          disabled={disabled}
          onPress={() => {
            onOutdent(step);
          }}
        />
      )}
    </View>
  );
}

export const StepRow = memo(Row);
