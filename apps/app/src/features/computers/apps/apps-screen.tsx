import type { ReactNode } from 'react';
import { View } from 'react-native';
import { ReasonLine } from '../../../components/reason-line';
import { ComputerFrame } from '../components/computer-frame';
import { useComputerReach } from '../data/computer-scopes';
import { SectionGate } from '../processes/section-gate';
import { AppsSection } from './apps-section';
import { OpenSection } from './open-section';
import { TilingSection } from './tiling-section';
import { WindowsSection } from './windows-section';

export function ComputerAppsScreen({ deviceId }: { readonly deviceId: string }): ReactNode {
  const reach = useComputerReach(deviceId);
  return (
    <ComputerFrame deviceId={deviceId} title="Apps and windows" width="dashboard">
      <SectionGate deviceId={deviceId} section="apps" scope="apps">
        {reach.online ? null : (
          <ReasonLine
            icon="wifiOff"
            tone="warning"
            text={`${reach.name} is offline. Windows and apps come back when it is.`}
          />
        )}
        <View className="flex-row flex-wrap items-start gap-section-gap">
          <View className="w-full max-w-reading gap-section-gap">
            <OpenSection deviceId={deviceId} machine={reach.name} online={reach.online} />
            <WindowsSection deviceId={deviceId} online={reach.online} />
          </View>
          <View className="w-full max-w-detail gap-section-gap">
            <TilingSection deviceId={deviceId} online={reach.online} />
            <AppsSection deviceId={deviceId} machine={reach.name} online={reach.online} />
          </View>
        </View>
      </SectionGate>
    </ComputerFrame>
  );
}
