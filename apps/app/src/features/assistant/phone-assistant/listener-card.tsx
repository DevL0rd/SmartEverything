import type { ReactNode } from 'react';
import { View } from 'react-native';
import {
  DEFAULT_LISTENING_POWER_MODE,
  type ListeningPowerMode,
  type ListeningSource,
  type ListeningSourceChange,
  type ListeningView,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { Badge } from '../../../components/badge';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { LoadedQuery } from '../../../components/loaded-query';
import { SwitchTrack } from '../../../components/switch';
import { Text } from '../../../components/text';
import { useValue } from '../../../design/external-store';
import { selectionTick } from '../../../platform/haptics';
import { allowMicrophone } from '../../phone';
import { useAssistantName } from '../data/assistant-data';
import { useHubOffline, useListeningChange, useListeningView } from '../listening/listening-data';
import { phoneEar } from '../phone-ear/phone-ear-live';
import { useThisPhoneSource } from './listener-data';
import { BATTERY_ESTIMATE_NOTE, MEASURE_HINT, batteryNote, earStatus } from './listener-model';
import { PowerModeList } from './power-mode-list';

function Unshared(): ReactNode {
  return (
    <Banner
      tone="info"
      title="This phone is not shared with your home yet"
      body="Turn on Share this phone with your home first. Then it can listen for the AI’s name."
      wrapBody
      action={{ label: 'Open phone settings', href: href.settings.page('this-phone') }}
    />
  );
}

function WakeSwitch({
  source,
  disabled,
  onChange,
}: {
  readonly source: ListeningSource;
  readonly disabled: boolean;
  readonly onChange: (change: ListeningSourceChange) => void;
}): ReactNode {
  const name = useAssistantName();
  const ear = useValue(phoneEar.view);
  const mode = source.power_mode ?? DEFAULT_LISTENING_POWER_MODE;
  const status = earStatus({
    wake: source.wake,
    mode,
    native: ear.native,
    microphone: ear.microphone,
    offline: disabled,
  });
  return (
    <Interactive
      role="switch"
      checked={source.wake}
      disabled={disabled}
      label={`Listen for ${name} on this phone`}
      onPress={() => {
        selectionTick();
        onChange({ wake: !source.wake });
      }}
      className="min-h-touch-min flex-row items-center gap-3 rounded-lg bg-surface-2 px-4 py-3"
    >
      <Icon
        name={source.wake ? 'mic' : 'micOff'}
        size={24}
        tone={source.wake ? 'primary' : 'variant'}
      />
      <View className="min-w-0 flex-1 gap-1">
        <Text variant="body-strong">{`Listen for “${name}”`}</Text>
        <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
          <Badge label={status.label} tone={status.tone} />
          <Text variant="footnote" tone="variant" className="min-w-0 shrink">
            {status.detail}
          </Text>
        </View>
      </View>
      <SwitchTrack value={source.wake} />
    </Interactive>
  );
}

function MicrophoneFix(): ReactNode {
  const ear = useValue(phoneEar.view);
  if (ear.microphone !== 'denied') return null;
  return (
    <Banner
      tone="warning"
      title="The microphone is not allowed"
      body="Android needs it to listen for the wake word."
      wrapBody
      action={{
        label: 'Allow microphone',
        onPress: () => {
          background(allowMicrophone(), 'phone_assistant.microphone_failed');
        },
      }}
    />
  );
}

function Battery({ mode }: { readonly mode: ListeningPowerMode }): ReactNode {
  return (
    <View className="gap-4 rounded-lg bg-surface-2 px-4 py-3">
      <View className="flex-row items-start gap-3">
        <Icon name="battery" size={20} tone="variant" />
        <View className="min-w-0 flex-1 gap-1">
          <Text variant="body-strong">Battery</Text>
          <Text variant="footnote">{batteryNote(mode)}</Text>
          <Text variant="caption" tone="faint">
            {BATTERY_ESTIMATE_NOTE}
          </Text>
        </View>
      </View>
      <View className="flex-row items-start gap-3">
        <Icon name="gauge" size={20} tone="variant" />
        <View className="min-w-0 flex-1 gap-1">
          <Text variant="body-strong">Measure battery</Text>
          <Text variant="footnote" tone="variant">
            {MEASURE_HINT}
          </Text>
        </View>
      </View>
    </View>
  );
}

function Body({ view }: { readonly view: ListeningView }): ReactNode {
  const source = useThisPhoneSource(view);
  const offline = useHubOffline();
  const change = useListeningChange();
  if (source === null) return <Unshared />;
  const mode = source.power_mode ?? DEFAULT_LISTENING_POWER_MODE;
  const send = (patch: ListeningSourceChange): void => {
    background(change(source.key, patch, source.name), 'phone_assistant.change_failed');
  };
  return (
    <View className="gap-3">
      <Text variant="footnote" tone="variant">
        Off until you turn it on. Your cameras and computers keep listening either way.
      </Text>
      <WakeSwitch source={source} disabled={offline} onChange={send} />
      <MicrophoneFix />
      <Text variant="body-strong">When it may listen</Text>
      <PowerModeList
        value={mode}
        disabled={offline}
        onSelect={(next) => {
          send({ power_mode: next });
        }}
      />
      <Battery mode={mode} />
      <View className="-ml-4 self-start">
        <Button
          label="All listening settings"
          variant="text"
          href={href.settings.page('assistant/listening')}
        />
      </View>
    </View>
  );
}

export function ListenerCard(): ReactNode {
  const query = useListeningView();
  return (
    <Card title="Wake word on this phone" icon="mic">
      <LoadedQuery query={query}>{(view) => <Body view={view} />}</LoadedQuery>
    </Card>
  );
}
