import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { HomeCameraView, useCameraEntries } from '../../../cameras';
import { Button } from '../../../../components/button';
import { Icon, type IconName } from '../../../../components/icon';
import { Interactive } from '../../../../components/interactive';
import { Text } from '../../../../components/text';
import { cn } from '../../../../design/cn';
import { isNative } from '../../../../design/platform';
import type { CallView } from '../call-state';
import { stageNameOf, type StageKind } from '../model/call-stage';
import { AssistantOrb } from '../orb';
import { orbStateOf } from '../call-state';
import { SightPreview } from './sight-preview';

export interface StageActions {
  readonly onStopSharing: () => void;
  readonly onStopCamera: () => void;
  readonly onResume: () => void;
  readonly onRetryCamera: () => void;
  readonly onOpenSettings: () => void;
  readonly onStopTalking: () => void;
}

export function OrbStage({
  call,
  level,
  size,
  stoppable,
  onStopTalking,
}: {
  readonly call: CallView;
  readonly level: SharedValue<number>;
  readonly size: number;
  readonly stoppable: boolean;
  readonly onStopTalking: () => void;
}): ReactNode {
  const active = call.phase !== 'ended' && call.phase !== 'idle';
  return (
    <View className="items-center justify-center">
      <View className={cn(call.phase === 'reconnecting' && 'opacity-60')}>
        <AssistantOrb
          state={orbStateOf(call)}
          level={level}
          size={size}
          dimmed={!active || call.phase === 'reconnecting'}
        />
      </View>
      {stoppable ? (
        <View className="absolute inset-0 items-center justify-center">
          <Interactive
            label="Stop the assistant talking"
            onPress={onStopTalking}
            className="min-h-touch-min flex-row items-center gap-2 rounded-full bg-surface-raised px-5 elevation-2"
            layerClassName="rounded-full"
          >
            <Icon name="square" size={16} tone="default" />
            <Text variant="label">Stop</Text>
          </Interactive>
        </View>
      ) : null}
    </View>
  );
}

function Panel({
  icon,
  tone,
  title,
  body,
  children,
}: {
  readonly icon: IconName;
  readonly tone: 'critical' | 'primary' | 'variant';
  readonly title: string;
  readonly body: string;
  readonly children?: ReactNode;
}): ReactNode {
  return (
    <View className="absolute inset-0 items-center justify-center gap-3 bg-bg/85 px-6">
      <View className="size-14 items-center justify-center rounded-full bg-surface-3">
        <Icon name={icon} size={32} tone={tone} />
      </View>
      <Text variant="title-3" align="center" accessibilityLiveRegion="polite">
        {title}
      </Text>
      <Text variant="callout" tone="variant" align="center" className="max-w-call">
        {body}
      </Text>
      {children === undefined ? null : (
        <View className="flex-row flex-wrap justify-center gap-3 pt-1">{children}</View>
      )}
    </View>
  );
}

function CameraProblem({ call, actions }: StageProps): ReactNode {
  const denied = call.video.camera === 'denied';
  const settings = isNative() ? 'your phone’s settings' : 'your system or browser settings';
  return (
    <Panel
      icon="cameraOff"
      tone="critical"
      title={denied ? 'Camera not allowed' : 'Camera in use'}
      body={
        denied
          ? `Allow the camera for SmartEverything in ${settings}.`
          : 'Another app is using the camera. Close it, then try again.'
      }
    >
      {denied && isNative() ? (
        <Button label="Open settings" onPress={actions.onOpenSettings} />
      ) : null}
      {denied ? null : <Button label="Try again" onPress={actions.onRetryCamera} />}
      <Button label="Not now" variant="outlined" onPress={actions.onStopCamera} />
    </Panel>
  );
}

function CameraPaused({ onResume }: { readonly onResume: () => void }): ReactNode {
  return (
    <Interactive
      label="Camera paused. Resume video"
      onPress={onResume}
      className="absolute inset-0 items-center justify-center bg-black/60"
    >
      <View className="items-center gap-1 rounded-lg bg-surface-raised/90 px-6 py-4">
        <Icon name="pause" size={24} tone="default" />
        <Text variant="label">Camera paused</Text>
        <Text variant="caption" tone="variant">
          The assistant isn’t seeing frames
        </Text>
      </View>
    </Interactive>
  );
}

export interface StageProps {
  readonly call: CallView;
  readonly actions: StageActions;
}

export function CameraStage({ call, actions }: StageProps): ReactNode {
  const phase = call.video.camera;
  const shown = phase === 'on' || phase === 'paused';
  return (
    <View className="absolute inset-0 overflow-hidden bg-surface-2">
      {shown ? (
        <SightPreview
          slot="sent"
          fit="cover"
          label="Your camera"
          facing={call.video.facing}
          light={call.video.light}
        />
      ) : null}
      {phase === 'starting' ? (
        <View className="absolute inset-0 items-center justify-center">
          <Text variant="callout" tone="variant" accessibilityLiveRegion="polite">
            Starting camera…
          </Text>
        </View>
      ) : null}
      {phase === 'paused' ? <CameraPaused onResume={actions.onResume} /> : null}
      {phase === 'denied' || phase === 'busy' ? (
        <CameraProblem call={call} actions={actions} />
      ) : null}
    </View>
  );
}

export function ScreenPanel({ call, actions }: StageProps): ReactNode {
  const lastLook = call.looks.findLast((look) => look.picture !== null);
  return (
    <View className="flex-1 items-center justify-center gap-3 px-6">
      <View className="size-16 items-center justify-center rounded-full bg-primary-container">
        <Icon name="screenShare" size={32} tone="primary" />
      </View>
      <Text variant="title-3" align="center">
        You’re sharing your screen
      </Text>
      <Text variant="callout" tone="variant" align="center" className="max-w-call">
        {`Switch to the app you want to show. ${
          lastLook === undefined ? '' : 'The assistant keeps looking while you talk.'
        }`.trim()}
      </Text>
      <Button
        label="Stop sharing"
        icon="square"
        variant="destructive"
        onPress={actions.onStopSharing}
      />
    </View>
  );
}

export function ScreenPreviewStage({ call }: { readonly call: CallView }): ReactNode {
  return (
    <View className="absolute inset-0 overflow-hidden rounded-xl bg-black">
      <SightPreview
        slot="sent"
        fit="contain"
        label={stageNameOf(call, 'screen-preview')}
        facing={call.video.facing}
        light={false}
      />
    </View>
  );
}

export function HomeStage({ call }: { readonly call: CallView }): ReactNode {
  const label = call.sight?.label ?? null;
  const entry = useCameraEntries().find((candidate) => candidate.name === label);
  return (
    <View className="absolute inset-0 overflow-hidden bg-black">
      {entry === undefined ? null : <HomeCameraView cameraId={entry.device.id} />}
    </View>
  );
}

export function stageNeedsPreviewChip(kind: StageKind): boolean {
  return kind === 'camera' || kind === 'home' || kind === 'screen-preview';
}
