import type { ReactNode } from 'react';
import { Linking, View } from 'react-native';
import type { NativeHubDiscovery } from '@smarteverything/domain';
import { Button } from '../../components/button';
import { ListRow } from '../../components/list-row';
import { List } from '../../components/section';
import { Text } from '../../components/text';
import { appPlatform } from '../../design/platform';
import { useValue } from '../../design/external-store';
import type { PairingPresentation } from './pairing-actions';

function discoveryMessage(state: NativeHubDiscovery['state']): readonly [string, string] {
  switch (state) {
    case 'searching':
      return ['Looking for your home…', 'Keep both devices on the same network.'];
    case 'idle':
      return [
        'No homes found',
        'Keep both devices on the same network, or scan the pairing code on your desktop.',
      ];
    case 'permission-required':
      return ['Local network access needed', 'Allow local network access to find your home.'];
    case 'unsupported':
      return [
        'Use a pairing code or invitation',
        appPlatform() === 'web'
          ? 'Nearby search is available in the Android and desktop apps.'
          : 'Nearby search is unavailable in this app. Scan the code on your desktop.',
      ];
    case 'unavailable':
      return [
        'Nearby search is unavailable',
        'Search again, or scan the pairing code on your desktop.',
      ];
  }
}

function DiscoveryRows({
  discovery,
  pairing,
}: {
  readonly discovery: NativeHubDiscovery;
  readonly pairing: PairingPresentation;
}): ReactNode {
  const [title, subtitle] = discoveryMessage(discovery.state);
  if (discovery.candidates.length === 0)
    return <ListRow icon="home" title={title} subtitle={subtitle} wrapSubtitle />;
  return discovery.candidates.map((candidate) => {
    const repeated =
      discovery.candidates.filter((entry) => entry.name === candidate.name).length > 1;
    return (
      <ListRow
        key={candidate.url}
        icon="home"
        title={candidate.name}
        chevron
        subtitle={repeated ? `Tap to pair · ${new URL(candidate.url).host}` : 'Tap to pair'}
        wrapSubtitle
        onPress={() => {
          pairing.select(candidate.url);
        }}
      />
    );
  });
}

export function DiscoveryList({ pairing }: { readonly pairing: PairingPresentation }): ReactNode {
  const discovery = useValue(pairing.controller.discovery.state);
  const [title, subtitle] = discoveryMessage(discovery.state);
  const completion =
    discovery.candidates.length === 0
      ? `${title}. ${subtitle}`
      : `${String(discovery.candidates.length)} nearby homes. Choose one to pair.`;
  return (
    <View className="gap-2">
      <List title="Nearby homes" inset>
        <DiscoveryRows discovery={discovery} pairing={pairing} />
      </List>
      <Text variant="footnote" tone="variant" accessibilityLiveRegion="polite">
        {discovery.state === 'searching' ? '' : completion}
      </Text>
      {discovery.state === 'unsupported' || discovery.state === 'permission-required' ? null : (
        <Button
          label="Search again"
          variant="text"
          onPress={() => {
            pairing.controller.discovery.search();
          }}
        />
      )}
      {discovery.state === 'permission-required' ? (
        <Button
          label="Open settings"
          variant="text"
          onPress={() => {
            void Linking.openSettings().catch((error: unknown) => {
              pairing.cleanupFailed(error);
            });
          }}
        />
      ) : null}
    </View>
  );
}
