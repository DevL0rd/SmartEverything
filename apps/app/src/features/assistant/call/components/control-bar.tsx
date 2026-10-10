import type { ReactNode, RefObject } from 'react';
import { View } from 'react-native';
import { Text } from '../../../../components/text';
import { cn } from '../../../../design/cn';
import type { CallView } from '../call-state';
import type { CallLayout } from '../model/call-layout';
import { controlsOf, type CallControlHandlers, type ControlReasons } from '../model/call-controls';
import { PointerControl, TouchControl } from './control-button';

export interface ControlBarProps {
  readonly call: CallView;
  readonly layout: CallLayout;
  readonly reasons: ControlReasons;
  readonly handlers: CallControlHandlers;
  readonly cameraAnchor: RefObject<View | null>;
  readonly shareAnchor: RefObject<View | null>;
  readonly settingsOpen: boolean;
  readonly menu: 'camera' | 'share' | null;
}

export function ControlBar({ layout, ...rest }: ControlBarProps): ReactNode {
  const specs = controlsOf({
    call: rest.call,
    reasons: rest.reasons,
    handlers: rest.handlers,
    settingsOpen: rest.settingsOpen,
    pointer: layout.floatingBar,
  });
  const anchors: Readonly<Record<string, RefObject<View | null>>> = {
    camera: rest.cameraAnchor,
    share: rest.shareAnchor,
  };
  const reason = rest.reasons.notice;
  if (layout.floatingBar) {
    return (
      <View className="items-center gap-2">
        {reason === null ? null : <Reason text={reason} />}
        <View className="flex-row items-center gap-1 rounded-full bg-surface-2 p-1.5 elevation-2">
          {specs.map((spec) => (
            <PointerControl key={spec.key} spec={spec} anchor={anchors[spec.key] ?? null} />
          ))}
        </View>
      </View>
    );
  }
  return (
    <View className="w-full items-center gap-2">
      {reason === null ? null : <Reason text={reason} />}
      <View
        className={cn(
          'w-full flex-row items-start justify-center',
          layout.roomy ? 'gap-6' : 'gap-3',
        )}
      >
        {specs.map((spec) => (
          <TouchControl key={spec.key} spec={spec} anchor={anchors[spec.key] ?? null} />
        ))}
      </View>
    </View>
  );
}

function Reason({ text }: { readonly text: string }): ReactNode {
  return (
    <Text variant="caption" tone="variant" align="center" accessibilityLiveRegion="polite">
      {text}
    </Text>
  );
}
