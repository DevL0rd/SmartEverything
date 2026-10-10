import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import { useSizeClass } from '../../../design/size-class';
import { useCameraPrefs } from '../data/use-camera-condition';
import { useCameraReaches } from '../data/use-cameras';

function FirewallBanner({ desktop }: { readonly desktop: boolean }): ReactNode {
  return desktop ? (
    <Banner
      tone="warning"
      title="Some cameras need a firewall rule"
      action={{ label: 'Review', href: href.firewallFix() }}
    />
  ) : (
    <Banner
      tone="warning"
      title="Some cameras need a firewall rule"
      body="Fix it in the SmartEverything app on your computer."
    />
  );
}

export function useCameraBanners(): ReactNode {
  const reaches = useCameraReaches();
  const desktop = useSizeClass().platform === 'desktop';
  const { problem } = useCameraPrefs();
  const firewall = reaches.some((reach) => reach.state === 'needs_rule');
  if (!firewall && problem === null) {
    return undefined;
  }
  return (
    <View className="gap-2">
      {firewall ? <FirewallBanner desktop={desktop} /> : null}
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
