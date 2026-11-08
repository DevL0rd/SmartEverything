import type { ReactNode } from 'react';
import { View } from 'react-native';
import { SettingsFrame } from '../../../settings/settings-frame';
import { ListenerCard } from './listener-card';
import { SetupHero } from './setup-hero';
import { SetupList } from './setup-list';
import { useSetupFacts } from './setup-facts';
import { setupProgress, setupSteps } from './setup-model';

const PAGE = 'assistant/phone';

export function PhoneAssistantScreen(): ReactNode {
  const steps = setupSteps(useSetupFacts());
  const progress = setupProgress(steps);
  return (
    <SettingsFrame page={PAGE} contentWidth="detail">
      <SetupHero steps={steps} progress={progress} />
      <View className="flex-row flex-wrap items-start gap-section-gap">
        <View className="min-w-0 grow shrink basis-96">
          <SetupList steps={steps} progress={progress} />
        </View>
        <View className="min-w-0 grow shrink basis-96">
          <ListenerCard />
        </View>
      </View>
    </SettingsFrame>
  );
}
