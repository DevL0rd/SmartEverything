import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';
import type { PhoneFeature } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { ReasonLine } from '../../../components/reason-line';
import type { Device } from '../../../store/state';
import { usePhoneView } from './use-phone-view';
import { featuresOf } from '../model/face-model';

export function PermissionNeed({
  device,
  feature,
}: {
  readonly device: Device;
  readonly feature: PhoneFeature;
}): ReactNode {
  const router = useRouter();
  const here = usePhoneView(device).here;
  const support = featuresOf(device.details).find((entry) => entry.feature === feature);
  if (support?.state !== 'needs_permission') return null;
  return (
    <ReasonLine
      icon="alert"
      tone="warning"
      text={
        here
          ? support.reason
          : `${support.reason}. Open SmartEverything on ${device.label} to allow it.`
      }
      {...(here
        ? {
            action: {
              label: 'Open Setup',
              onPress: (): void => {
                router.push(href.settings.device(device.id, 'setup'));
              },
            },
          }
        : {})}
    />
  );
}
