import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import { useIsOwner } from '../../../store/selectors';
import { useCameraPrefs } from '../data/use-camera-condition';
import { useCameraReaches } from '../data/use-cameras';

function FirewallBanner({ owner }: { readonly owner: boolean }): ReactNode {
  return owner ? (
    <Banner
      tone="warning"
      title="Some cameras need a firewall rule"
      action={{ label: 'Review', href: href.firewallFix() }}
    />
  ) : (
    <Banner
      tone="warning"
      title="Some cameras need a firewall rule"
      body="Ask the owner of this home to fix it."
    />
  );
}

export function useCameraBanners(): ReactNode {
  const reaches = useCameraReaches();
  const owner = useIsOwner();
  const { problem } = useCameraPrefs();
  const firewall = reaches.some((reach) => reach.state === 'needs_rule');
  if (!firewall && problem === null) {
    return undefined;
  }
  return (
    <View className="gap-2">
      {firewall ? <FirewallBanner owner={owner} /> : null}
      {problem === null ? null : (
        <Banner
          tone="critical"
          title="Your camera choices couldn’t be read"
          body={problem.reason}
          action={{ label: 'Reset', onPress: problem.reset }}
        />
      )}
    </View>
  );
}
