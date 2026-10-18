import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useAreaWidth } from '../../../design/size-class';
import { SettingsFrame } from '../../../settings/settings-frame';
import { ListenerCard } from './listener-card';
import { SetupHero } from './setup-hero';
import { SetupList } from './setup-list';
import { useSetupFacts } from './setup-facts';
import { setupProgress, setupSteps } from './setup-model';

const PAGE = 'assistant/phone';

const TWO_COLUMNS_FROM = 960;

export function PhoneAssistantScreen(): ReactNode {
  const steps = setupSteps(useSetupFacts());
  const progress = setupProgress(steps);
  const wide = useAreaWidth() >= TWO_COLUMNS_FROM;
  return (
    <SettingsFrame page={PAGE} maxWidth="detail">
      <SetupHero steps={steps} progress={progress} />
      <View className={wide ? 'flex-row items-start gap-5' : 'gap-5'}>
        <View className="min-w-0 flex-1">
          <SetupList steps={steps} progress={progress} />
        </View>
        <View className="min-w-0 flex-1">
          <ListenerCard />
        </View>
      </View>
    </SettingsFrame>
  );
}
