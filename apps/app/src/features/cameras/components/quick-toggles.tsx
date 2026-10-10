import type { ReactNode } from 'react';
import {
  presentDevice,
  type CapabilityRole,
  type PresentedCapability,
} from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { List, SectionAction } from '../../../components/section';
import { Sheet } from '../../../components/sheet';
import { CapabilityRow, offlineReason } from '../../devices';
import type { CameraEntry } from '../logic/cameras';
import { PrivacyRow, hasPrivacySwitch } from './privacy-row';

const QUICK_ROLES: readonly CapabilityRole[] = [
  'follow_people',
  'follow_pets',
  'smart_zoom',
  'night_vision',
  'status_light',
  'image_flip',
];

function quickCapabilities(entry: CameraEntry): readonly PresentedCapability[] {
  const presented = presentDevice(entry.device).capabilities.filter(
    (capability) => capability.writable,
  );
  return QUICK_ROLES.flatMap((role) => {
    const match = presented.find((capability) => capability.role === role);
    return match === undefined ? [] : [match];
  });
}

function Rows({ entry }: { readonly entry: CameraEntry }): ReactNode {
  const reason = entry.device.online ? null : offlineReason(entry.name);
  return (
    <>
      {hasPrivacySwitch(entry) ? <PrivacyRow entry={entry} /> : null}
      {quickCapabilities(entry).map((presented) => (
        <CapabilityRow
          key={presented.key}
          device={entry.device}
          presented={presented}
          reason={reason}
        />
      ))}
    </>
  );
}

export function hasQuickToggles(entry: CameraEntry): boolean {
  return hasPrivacySwitch(entry) || quickCapabilities(entry).length > 0;
}

function AllSettings({ entry }: { readonly entry: CameraEntry }): ReactNode {
  return <SectionAction label="All settings" href={href.settings.camera(entry.device.id)} />;
}

export function QuickToggles({ entry }: { readonly entry: CameraEntry }): ReactNode {
  if (!hasQuickToggles(entry)) {
    return null;
  }
  return (
    <List inset title="Quick settings" action={<AllSettings entry={entry} />}>
      <Rows entry={entry} />
    </List>
  );
}

export function QuickTogglesSheet({
  entry,
  open,
  onClose,
}: {
  readonly entry: CameraEntry;
  readonly open: boolean;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Quick settings"
      detents={['half', 'full']}
      footer={<AllSettings entry={entry} />}
    >
      <List inset>
        <Rows entry={entry} />
      </List>
    </Sheet>
  );
}
