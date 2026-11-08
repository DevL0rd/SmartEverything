import type { ReactNode } from 'react';
import { View } from 'react-native';
import { DemandRegion } from '../../../store/demand-region';
import { useRows } from '../../../store/selectors';
import { MOUNT_TOPICS } from './mount-actions';
import { MountCard } from './mount-card';
import { setupOf, thisMountOf, type ThisMount } from './mount-model';
import { MountSetupSteps } from './mount-setup-steps';
import { MountTierCards } from './mount-tier-cards';
import { ThisComputerOnly, type ThisComputer } from './this-computer';

export function MountDemand({
  deviceId,
  mount,
  children,
}: {
  readonly deviceId: string;
  readonly mount: ThisMount;
  readonly children: ReactNode;
}): ReactNode {
  if (!mount.enabled) return children;
  return (
    <DemandRegion deviceId={deviceId} topics={MOUNT_TOPICS}>
      {children}
    </DemandRegion>
  );
}

function MountHero({ computer }: { readonly computer: ThisComputer }): ReactNode {
  const mount = thisMountOf(computer.deviceId, useRows('drive_placements'));
  const setup = setupOf(computer.platform, mount);
  return (
    <MountDemand deviceId={computer.deviceId} mount={mount}>
      <View className="gap-4">
        <MountCard deviceId={computer.deviceId} mount={mount} />
        {setup === null ? null : <MountSetupSteps setup={setup} command={null} />}
        <MountTierCards platform={computer.platform} mount={mount} />
      </View>
    </MountDemand>
  );
}

export function ThisComputerMount(): ReactNode {
  return <ThisComputerOnly>{(computer) => <MountHero computer={computer} />}</ThisComputerOnly>;
}
