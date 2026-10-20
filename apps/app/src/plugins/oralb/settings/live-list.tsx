import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { ListRow } from '../../../components/list-row';
import { NavRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useConfigure } from '../../toothbrush/data/brush-act';
import { Anchored } from '../../toothbrush/settings/anchored';
import type { SettingsProps } from '../../toothbrush/settings/settings-props';
import { useOralbConfig } from '../data/use-oralb';
import { LIVE_CHOICES, type Cost } from '../model/settings-model';

const ANCHORS = {
  broadcast: { id: 'oralb-live-broadcast' },
  connected: { id: 'oralb-live-connected' },
} as const;

function Meter({ label, level }: { readonly label: string; readonly level: 1 | 2 | 3 }): ReactNode {
  return (
    <View
      accessible
      accessibilityLabel={`${label} cost ${String(level)} of 3`}
      className="flex-row items-center gap-1.5"
    >
      <Text variant="caption" tone="variant" className="w-12">
        {label}
      </Text>
      <View aria-hidden className="flex-row gap-0.5">
        {[1, 2, 3].map((step) => (
          <View
            key={step}
            className={cn('h-2 w-3 rounded-full', step <= level ? 'bg-primary' : 'bg-surface-3')}
          />
        ))}
      </View>
    </View>
  );
}

function Costs({ cost }: { readonly cost: Cost }): ReactNode {
  return (
    <View className="gap-1">
      <Meter label="Live" level={cost.live} />
      <Meter label="Battery" level={cost.battery} />
    </View>
  );
}

export function LiveList({ deviceId, state }: SettingsProps): ReactNode {
  const { oralb } = useOralbConfig(deviceId);
  const configure = useConfigure(deviceId);
  if (!state.mayConfigure) {
    return null;
  }
  return (
    <Anchored deviceId={deviceId} id="oralb-live" label="Live data">
      <List
        inset
        title="Live data"
        footer="The Oral-B app and this app cannot hold the brush at the same time. Close the Oral-B app while connected, then either can be used, one at a time."
      >
        {LIVE_CHOICES.map((choice) => (
          <Anchored
            key={choice.value}
            deviceId={deviceId}
            id={ANCHORS[choice.value].id}
            label={`${choice.label} live data`}
          >
            <ListRow
              icon={choice.value === 'connected' ? 'bluetooth' : 'radio'}
              title={choice.label}
              subtitle={choice.detail}
              wrapSubtitle
              selected={oralb.live === choice.value}
              label={`${choice.label}. ${choice.detail}`}
              trailing={<Costs cost={choice.cost} />}
              onPress={() => {
                configure({ oralb: { live: choice.value } });
              }}
            />
          </Anchored>
        ))}
        <Anchored deviceId={deviceId} id="oralb-rerun-setup" label="Run setup again">
          <NavRow
            icon="refresh"
            title="Run setup again"
            subtitle="Reads the brush once more"
            href={href.connect('sonicare')}
          />
        </Anchored>
      </List>
    </Anchored>
  );
}
