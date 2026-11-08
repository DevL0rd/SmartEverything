import type { ReactNode, Ref } from 'react';
import type { View as ViewHandle } from 'react-native';
import { View } from 'react-native';
import { cn } from '../../design/cn';
import { Button, type ButtonProps } from '../button';
import type { IconName } from '../icon';
import { IconButton } from '../icon-button';
import { Interactive } from '../interactive';
import { Text } from '../text';
import { selectionLabel } from './file-kind';

export interface SelectionAction {
  readonly label: string;
  readonly icon?: IconName;
  readonly variant: NonNullable<ButtonProps['variant']>;
  readonly disabled?: boolean;
  readonly onPress?: () => void;
}

export type SelectionSummary =
  | {
      readonly kind: 'count';
      readonly count: number;
      readonly total: number;
      readonly onClear: () => void;
      readonly onSelectAll: () => void;
    }
  | {
      readonly kind: 'item';
      readonly name: string;
      readonly caption: string;
      readonly onDetails: () => void;
    };

export interface SelectionBarProps {
  readonly summary: SelectionSummary;
  readonly actions: readonly SelectionAction[];
  readonly docked?: boolean;
  readonly summaryRef?: Ref<ViewHandle>;
  readonly primaryRef?: Ref<ViewHandle>;
}

function Summary({
  summary,
  summaryRef,
}: {
  readonly summary: SelectionSummary;
  readonly summaryRef: Ref<ViewHandle> | undefined;
}): ReactNode {
  if (summary.kind === 'item') {
    return (
      <Interactive
        ref={summaryRef}
        label={`Details of ${summary.name}`}
        onPress={summary.onDetails}
        className="min-h-touch-min min-w-0 flex-1 justify-center rounded-md px-2"
        layerClassName="rounded-md"
      >
        <Text variant="callout" numberOfLines={1}>
          {summary.name}
        </Text>
        <Text variant="caption" tone="variant" numberOfLines={1}>
          {summary.caption}
        </Text>
      </Interactive>
    );
  }
  return (
    <>
      <IconButton icon="close" label="Clear the selection" onPress={summary.onClear} />
      <Text variant="body-strong" className="min-w-0 flex-1">
        {selectionLabel(summary.count)}
      </Text>
      {summary.count < summary.total ? (
        <Button label="Select all" variant="text" onPress={summary.onSelectAll} />
      ) : null}
    </>
  );
}

function ActionButton({
  action,
  primaryRef,
}: {
  readonly action: SelectionAction;
  readonly primaryRef: Ref<ViewHandle> | undefined;
}): ReactNode {
  const ref = action.variant === 'filled' ? primaryRef : undefined;
  return (
    <Button
      label={action.label}
      variant={action.variant}
      {...(action.icon === undefined ? {} : { icon: action.icon })}
      {...(action.disabled === undefined ? {} : { disabled: action.disabled })}
      {...(action.onPress === undefined ? {} : { onPress: action.onPress })}
      {...(ref === undefined ? {} : { ref })}
    />
  );
}

export function SelectionBar({
  summary,
  actions,
  docked = false,
  summaryRef,
  primaryRef,
}: SelectionBarProps): ReactNode {
  return (
    <View
      className={cn(
        'flex-row items-center gap-2',
        docked ? 'border-t border-outline-variant p-3' : 'flex-wrap',
      )}
    >
      <Summary summary={summary} summaryRef={summaryRef} />
      {actions.map((action) => (
        <ActionButton key={action.label} action={action} primaryRef={primaryRef} />
      ))}
    </View>
  );
}
