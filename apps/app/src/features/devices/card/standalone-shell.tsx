import type { ReactNode } from 'react';
import { createContext, use, useEffect, useState } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import type { ContextMenu } from '../../../components/menu';
import { Interactive } from '../../../components/interactive';
import type { Device } from '../../../store/state';
import { DeviceScheduleChip } from '../../automations';
import { VisualVisibility } from '../../../design/visibility';
import { useDeviceContextMenu } from '../controls/device-context-menu';

interface ShellLink {
  readonly device: Device;
  readonly editing: boolean;
  readonly menu: ContextMenu;
  readonly claimSchedule: (claimed: boolean) => void;
}

const ShellContext = createContext<ShellLink | null>(null);

export function useClaimSchedule(claimed: boolean): void {
  const claim = use(ShellContext)?.claimSchedule;
  useEffect(() => {
    claim?.(claimed);
    return (): void => {
      claim?.(false);
    };
  }, [claim, claimed]);
}

function OpenLink(): ReactNode {
  const shell = use(ShellContext);
  if (shell === null) {
    return null;
  }
  const { device, editing, menu } = shell;
  return (
    <Interactive
      label={device.label}
      hint="Hold for more"
      disabled={editing}
      href={href.device(device)}
      onLongPress={menu.onLongPress}
      onContextMenu={menu.onContextMenu}
      className="absolute inset-0"
      layerClassName="rounded-lg"
    >
      {null}
    </Interactive>
  );
}

export function StandaloneShell({
  device,
  editing,
  quickControls,
  padded,
  children,
}: {
  readonly device: Device;
  readonly editing: boolean;
  readonly quickControls: boolean;
  readonly padded: boolean;
  readonly children: ReactNode;
}): ReactNode {
  const menu = useDeviceContextMenu(device, { quickControls, label: device.label });
  const [scheduleInFace, claimSchedule] = useState(false);
  return (
    <ShellContext value={{ device, editing, menu, claimSchedule }}>
      <View className="h-full overflow-hidden rounded-lg border-hairline border-outline-variant bg-surface-1 elevation-1">
        {padded ? <OpenLink /> : null}
        <View
          className={padded ? 'flex-1 p-card-pad' : 'flex-1'}
          pointerEvents={editing ? 'none' : 'box-none'}
        >
          <VisualVisibility visible={!editing}>{children}</VisualVisibility>
        </View>
        {editing || scheduleInFace ? null : (
          <DeviceScheduleChip
            deviceId={device.id}
            compact
            pinnedClassName="absolute bottom-2 right-2"
          />
        )}
        {menu.host}
      </View>
    </ShellContext>
  );
}
