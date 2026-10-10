import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Stack, type SingularOptions } from 'expo-router';
import { useStackOptions } from '../../../app-shell/tab-stack';
import { MasterDetail } from '../../../components/master-detail';
import { useSizeClass } from '../../../design/size-class';
import { AutomationsMaster } from '../components/automations-master';
import { isMasterWidth } from './shared';

function idOf(key: string): SingularOptions {
  return (_name, params) => {
    const value = params[key];
    return typeof value === 'string' ? value : undefined;
  };
}

export function AutomationsLayout(): ReactNode {
  const { width } = useSizeClass();
  const options = useStackOptions();
  const master = isMasterWidth(width);
  const stack = (
    <Stack screenOptions={master ? { ...options, animation: 'none' } : options}>
      <Stack.Screen name="[automationId]/index" dangerouslySingular={idOf('automationId')} />
      <Stack.Screen name="scenes/[sceneId]" dangerouslySingular={idOf('sceneId')} />
    </Stack>
  );
  return master ? (
    <MasterDetail
      masterWidth="popover"
      master={<AutomationsMaster />}
      detail={<View className="flex-1">{stack}</View>}
    />
  ) : (
    stack
  );
}
