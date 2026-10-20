import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { IrRemoteRow } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { ReasonLine } from '../../../components/reason-line';
import { Text } from '../../../components/text';
import type { Device } from '../../../store/state';
import { useRemotes } from './remote-section';
import { quickActionsOf } from './remote-actions';
import { CATEGORY_LOOKS } from './remote-category';
import { RemoteExtras } from './remote-extras';
import { LearnButton } from './remote-face';
import { useLearnedSource, useDeviceRemoteSource, type RemoteSource } from './remote-source';
import { useRemoteView } from './use-remote-view';

function Controls({ source }: { readonly source: RemoteSource }): ReactNode {
  const view = useRemoteView(source);
  const controls =
    view.blocked !== null ? (
      <ReasonLine text={view.blocked} />
    ) : view.empty ? (
      <LearnButton source={source} />
    ) : (
      quickActionsOf({
        controls: view.controls,
        assumed: view.assumed,
        on: view.on,
        press: view.press,
      })
    );
  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap items-center gap-2">
        <Badge label={view.chip.label} tone={view.chip.tone} />
        <Text variant="callout" tone={view.line.tone} numberOfLines={1} className="shrink">
          {view.line.text}
        </Text>
      </View>
      {controls}
      {view.failure === null ? null : (
        <Text variant="footnote" tone={view.failure.tone}>
          {view.failure.text}
        </Text>
      )}
      <RemoteExtras source={source} />
    </View>
  );
}

export function RemoteQuick({ device }: { readonly device: Device }): ReactNode {
  return <Controls source={useDeviceRemoteSource(device)} />;
}

function Titled({ source }: { readonly source: RemoteSource }): ReactNode {
  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-2">
        <Icon name={CATEGORY_LOOKS[source.category].icon} size={20} tone="variant" />
        <Text variant="body-strong" numberOfLines={1} className="shrink">
          {source.name}
        </Text>
      </View>
      <Controls source={source} />
    </View>
  );
}

function LearnedTitled({
  blaster,
  remote,
}: {
  readonly blaster: Device;
  readonly remote: IrRemoteRow;
}): ReactNode {
  return <Titled source={useLearnedSource(blaster, remote)} />;
}

export function BlasterQuick({ device }: { readonly device: Device }): ReactNode {
  const { remotes } = useRemotes(device);
  if (remotes.length === 0) {
    return (
      <View className="flex-row">
        <Button
          label="Learn a button"
          icon="plus"
          href={href.settings.device(device.id, 'remotes')}
        />
      </View>
    );
  }
  return (
    <View className="gap-5">
      {remotes.map((remote) => (
        <LearnedTitled key={remote.id} blaster={device} remote={remote} />
      ))}
    </View>
  );
}
