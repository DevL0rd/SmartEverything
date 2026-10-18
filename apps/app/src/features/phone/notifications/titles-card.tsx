import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Text } from '../../../components/text';
import type { Device } from '../../../store/state';
import { usePhoneView } from '../components/use-phone-view';

export function TitlesOffCard({ device }: { readonly device: Device }): ReactNode {
  const router = useRouter();
  const here = usePhoneView(device).here;
  return (
    <Card title="Titles" icon="lock">
      <Text variant="callout" tone="variant">
        {here
          ? 'Only counts are shared. Turn on notification titles in Setup to see them here.'
          : `Only counts are shared. Turn on notification titles in Setup on ${device.label} to see them here.`}
      </Text>
      {here ? (
        <Button
          label="Open Setup"
          variant="tonal"
          onPress={() => {
            router.push(href.settings.device(device.id, 'setup'));
          }}
        />
      ) : null}
    </Card>
  );
}
