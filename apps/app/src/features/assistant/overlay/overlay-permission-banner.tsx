import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { ValueStore, useSelected, useValue } from '../../../design/external-store';
import { setLocalPref, useLocalPref } from '../../../store/local-prefs';
import { callActive, useCall } from '../call/call-state';
import { showOverlaySettings, useOverlayStatus } from './overlay-permission-row';
import { surfaceFacts } from './overlay-surface';

const waiting = new ValueStore<boolean>(false);

function bannerPending(
  active: boolean,
  foreground: boolean,
  canDraw: boolean | null,
  seen: boolean,
): boolean {
  return active && !foreground && canDraw === false && !seen;
}

function done(): void {
  setLocalPref('overlayBannerSeen', true);
  waiting.set(false);
}

function Banner(): ReactNode {
  return (
    <View
      accessibilityRole="alert"
      className="absolute inset-x-4 bottom-safe-offset-4 z-50 gap-3 rounded-xl border-hairline border-outline-variant bg-surface-raised p-4 elevation-2"
    >
      <View className="flex-row items-start gap-3">
        <View className="size-10 items-center justify-center rounded-full bg-primary-container">
          <Icon name="sparkles" size={20} tone="primary" />
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text variant="body-strong">Show call controls over other apps</Text>
          <Text variant="callout" tone="variant">
            Keep Mute and End within reach when you leave the call.
          </Text>
        </View>
      </View>
      <View className="flex-row gap-3">
        <Button
          label="Allow"
          grow
          onPress={() => {
            showOverlaySettings();
            done();
          }}
        />
        <Button label="Not now" variant="outlined" grow onPress={done} />
      </View>
    </View>
  );
}

export function OverlayPermissionBanner(): ReactNode {
  const active = callActive(useCall());
  const foreground = useSelected(surfaceFacts, (facts) => facts.foreground);
  const status = useOverlayStatus();
  const seen = useLocalPref('overlayBannerSeen');
  const pending = useValue(waiting);
  const canDraw = status === null ? null : status.canDrawOverlays;
  useEffect(() => {
    if (bannerPending(active, foreground, canDraw, seen)) {
      waiting.set(true);
    } else if (!active) {
      waiting.set(false);
    }
  }, [active, foreground, canDraw, seen]);
  return pending && foreground && active && !seen ? <Banner /> : null;
}
