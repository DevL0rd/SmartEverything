import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { useDrivePlacementRows } from '../data';
import { MountPanel } from './mount-panel';
import { mountSummaryOf } from './mount-summary';
import { useDesktopDrive, useThisComputer } from './this-computer';

export function ThisComputerMount(): ReactNode {
  const here = useThisComputer();
  const drive = useDesktopDrive();
  const placements = useDrivePlacementRows();
  if (here === null || drive === null) return null;
  return (
    <View className="gap-3">
      <MountPanel
        platform={here.platform}
        summary={mountSummaryOf(here.deviceId, placements)}
        drive={drive}
      />
      <View className="flex-row">
        <Button
          label="Open Computers"
          icon="laptop"
          variant="tonal"
          href={href.drivePage('computers')}
        />
      </View>
    </View>
  );
}
