import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { SettingsRow } from '@smarteverything/domain';
import { Banner } from '../../../../components/banner';
import { EmptyState } from '../../../../components/empty-state';
import { Text } from '../../../../components/text';
import { TextField } from '../../../../components/text-field';
import { ChoiceRow } from '../../../../components/setup/choice-row';
import { useFirewall, useIsOwner } from '../../../../store/selectors';
import { firewallSummary } from '../../model/firewall';
import { OpeningsList, CamerasList } from '../firewall-lists';
import type { Reach } from './network-steps';

export function FirewallBody(): ReactNode {
  const firewall = useFirewall();
  const owner = useIsOwner();
  if (firewall === null) {
    return (
      <Banner
        tone="info"
        title="The firewall has not been checked yet"
        body="Your server checks it when it starts. Continue, or come back in a moment."
        wrapBody
      />
    );
  }
  const summary = firewallSummary(firewall);
  return (
    <View className="gap-4">
      <Banner
        tone={summary.critical ? 'warning' : 'positive'}
        title={summary.text}
        body={
          summary.critical && !owner ? 'Ask the owner of this home to fix this.' : firewall.detail
        }
        wrapBody
      />
      <OpeningsList firewall={firewall} />
      <CamerasList firewall={firewall} />
    </View>
  );
}

export function ReachBody({
  reach,
  onChoose,
}: {
  readonly reach: Reach | null;
  readonly onChoose: (reach: Reach) => void;
}): ReactNode {
  return (
    <View accessibilityRole="radiogroup" className="gap-2">
      <ChoiceRow
        icon="home"
        title="Only at home"
        subtitle="Phones work on your home Wi-Fi."
        selected={reach === 'home'}
        onPress={() => {
          onChoose('home');
        }}
      />
      <ChoiceRow
        icon="globe"
        title="At home and away"
        subtitle="You need an address that works from outside, for example one your router or a tunnel gives you."
        selected={reach === 'away'}
        onPress={() => {
          onChoose('away');
        }}
      />
    </View>
  );
}

const HOW_TO_GET_ONE: readonly string[] = [
  'A name that points at your router, with a port forwarded to this server.',
  'A reverse proxy in front of this server.',
  'A tunnel that gives this server an https address.',
];

export function AddressBody({
  draft,
  problem,
  onChange,
  onSubmit,
}: {
  readonly draft: string;
  readonly problem: string | null;
  readonly onChange: (value: string) => void;
  readonly onSubmit: () => void;
}): ReactNode {
  return (
    <View className="gap-4">
      <TextField
        label="Public address"
        kind="url"
        value={draft}
        onChange={onChange}
        onSubmit={onSubmit}
        placeholder="https://"
        helper="Phones and assistants use it when you are away. It must be an https address that reaches this home."
        error={problem}
        focusOnMount
      />
      <View className="gap-2 rounded-lg bg-surface-2 px-4 py-3">
        <Text variant="body-strong">How do I get one?</Text>
        {HOW_TO_GET_ONE.map((line) => (
          <Text key={line} variant="footnote" tone="variant">
            {line}
          </Text>
        ))}
      </View>
    </View>
  );
}

export function VerifyBody({
  settings,
  busy,
}: {
  readonly settings: SettingsRow;
  readonly busy: boolean;
}): ReactNode {
  if (busy) {
    return <Banner tone="info" title="Checking from your home…" />;
  }
  if (settings.public_url_error !== null) {
    return (
      <Banner
        tone="critical"
        title="Your home cannot reach that address"
        body={settings.public_url_error}
        wrapBody
      />
    );
  }
  if (settings.public_url_verified_at === null) {
    return (
      <Banner
        tone="warning"
        title="This address has not been checked yet"
        body="Check it now to be sure phones and assistants can use it."
        wrapBody
      />
    );
  }
  return <Banner tone="positive" title="Your home reaches that address" />;
}

export function DoneBody({ reach }: { readonly reach: Reach | null }): ReactNode {
  return reach === 'away' ? (
    <EmptyState
      icon="globe"
      title="Phones can reach your home from outside"
      body="Pair a phone and it works at home and away."
    />
  ) : (
    <EmptyState
      icon="home"
      title="Phones work on your home network"
      body="You can add an address for when you are away at any time in Settings, Server."
    />
  );
}
