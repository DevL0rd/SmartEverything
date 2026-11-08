import type { ReactNode } from 'react';
import { View } from 'react-native';
import * as Linking from 'expo-linking';
import { background } from '@smarteverything/logging';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { CopyField } from '../../../components/copy-field';
import { ProgressSteps } from '../../../components/progress-steps';
import { Text } from '../../../components/text';
import { WINFSP_URL } from '../placements/placement-status';
import { setupCopyOf, type MountSetup } from './mount-model';

function SetupAction({
  setup,
  command,
}: {
  readonly setup: MountSetup;
  readonly command: string | null;
}): ReactNode {
  if (setup === 'fuse3') {
    return command === null ? (
      <Text variant="footnote" tone="variant">
        Install the fuse3 package with your system’s package manager.
      </Text>
    ) : (
      <CopyField label="Install command" value={command} />
    );
  }
  if (setup === 'winfsp') {
    return (
      <View className="flex-row">
        <Button
          label="Open winfsp.dev"
          icon="externalLink"
          variant="tonal"
          onPress={() => {
            background(Linking.openURL(WINFSP_URL), 'url.open_failed');
          }}
        />
      </View>
    );
  }
  return null;
}

export function MountSetupSteps({
  setup,
  command,
}: {
  readonly setup: MountSetup;
  readonly command: string | null;
}): ReactNode {
  const copy = setupCopyOf(setup);
  return (
    <Card title={copy.title} icon="wrench">
      <Text variant="footnote" tone="variant">
        {copy.lede}
      </Text>
      <ProgressSteps steps={copy.steps} />
      <SetupAction setup={setup} command={command} />
    </Card>
  );
}
