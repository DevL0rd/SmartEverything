import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { ReasonLine } from '../../../components/reason-line';
import { ComputerFrame } from '../components/computer-frame';
import { useComputerReach } from '../data/computer-scopes';
import { SectionGate, useSectionState } from '../processes/section-gate';
import { AppsSection, InstalledSearch } from './apps-section';
import { OpenSection } from './open-section';
import { TilingSection } from './tiling-section';
import { WindowsSection } from './windows-section';

export function ComputerAppsScreen({ deviceId }: { readonly deviceId: string }): ReactNode {
  const reach = useComputerReach(deviceId);
  const [query, setQuery] = useState('');
  const open = useSectionState(deviceId, 'apps', 'apps').kind === 'open';
  return (
    <ComputerFrame
      deviceId={deviceId}
      title="Apps and windows"
      {...(open
        ? {
            search: {
              value: query,
              onChange: setQuery,
              placeholder: 'Search installed apps',
              label: 'Search installed apps',
              panel:
                query.trim() === '' ? null : (
                  <InstalledSearch
                    deviceId={deviceId}
                    machine={reach.name}
                    online={reach.online}
                    query={query}
                  />
                ),
            },
          }
        : {})}
    >
      <SectionGate deviceId={deviceId} section="apps" scope="apps">
        {reach.online ? null : (
          <ReasonLine
            icon="wifiOff"
            tone="warning"
            text={`${reach.name} is offline. Windows and apps come back when it is.`}
          />
        )}
        <View className="flex-row flex-wrap items-start gap-section-gap">
          <View className="min-w-0 grow shrink basis-96 gap-section-gap">
            <OpenSection deviceId={deviceId} machine={reach.name} online={reach.online} />
            <WindowsSection deviceId={deviceId} online={reach.online} />
          </View>
          <View className="min-w-0 grow-2 shrink basis-128 gap-section-gap">
            <TilingSection deviceId={deviceId} online={reach.online} />
            <AppsSection deviceId={deviceId} machine={reach.name} online={reach.online} />
          </View>
        </View>
      </SectionGate>
    </ComputerFrame>
  );
}
