import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../../components/badge';
import { Button } from '../../../../components/button';
import { IconButton } from '../../../../components/icon-button';
import { Text } from '../../../../components/text';
import { useDocumentKeys } from '../../../../components/widget-board/edit/keys';
import { useStableCallback } from '../../../../design/use-stable-callback';
import { useIdiom } from '../../../../design/platform';
import {
  PAUSED_CHIP,
  debugActionForKey,
  debugControls,
  type DebugAction,
  type DebugControl,
  type DebugState,
  type PauseSummary,
} from './test-model';

export function BreakpointDot(): ReactNode {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      className="size-2.5 rounded-full bg-critical"
    />
  );
}

export interface DebugPillProps {
  readonly state: DebugState;
  readonly pause: PauseSummary | null;
  readonly onAction: (action: DebugAction) => void;
}

function Control({
  control,
  wide,
  onAction,
}: {
  readonly control: DebugControl;
  readonly wide: boolean;
  readonly onAction: (action: DebugAction) => void;
}): ReactNode {
  const press = (): void => {
    onAction(control.action);
  };
  if (!wide) {
    return (
      <IconButton
        icon={control.icon}
        label={control.label}
        disabled={!control.enabled}
        onPress={press}
        {...(control.shortcut === null ? {} : { shortcut: control.shortcut })}
      />
    );
  }
  return (
    <View className="items-center">
      <Button
        label={control.label}
        icon={control.icon}
        variant={control.action === 'stop' ? 'destructive' : 'text'}
        disabled={!control.enabled}
        onPress={press}
      />
      {control.shortcut === null ? null : (
        <Text variant="caption" tone="faint">
          {control.shortcut}
        </Text>
      )}
    </View>
  );
}

export function DebugPill({ state, pause, onAction }: DebugPillProps): ReactNode {
  const wide = useIdiom() === 'pointer';
  const handle = useStableCallback(({ key, shift }: { key: string; shift: boolean }): boolean => {
    const action = debugActionForKey(key, shift, state);
    if (action === null) return false;
    onAction(action);
    return true;
  });
  useDocumentKeys(true, handle);
  return (
    <View
      accessibilityRole="toolbar"
      accessibilityLabel="Step through the test"
      className="absolute bottom-4 self-center max-w-full flex-row items-center gap-2 rounded-full border border-outline-variant bg-surface-2 px-3 py-1.5"
    >
      {state.paused ? (
        <View className="flex-row items-center gap-2">
          <BreakpointDot />
          <Badge label={PAUSED_CHIP} tone="warning" />
          {pause === null || !wide ? null : (
            <Text variant="callout" numberOfLines={1} className="max-w-48">
              {pause.title}
            </Text>
          )}
        </View>
      ) : null}
      {debugControls(state).map((control) => (
        <Control key={control.action} control={control} wide={wide} onAction={onAction} />
      ))}
    </View>
  );
}
