import type { ReactNode } from 'react';
import { EmptyState } from '../../../components/empty-state';
import type { Device } from '../../../store/state';
import { useComputerDetail } from '../data/computer-metrics';
import { NOT_AVAILABLE, offersSection, SECTIONS } from '../model/sections';

export function useSectionOffered(device: Device, sectionId: string): boolean {
  const features = useComputerDetail(device.id, device.online).data?.features;
  const def = SECTIONS.find((section) => section.id === sectionId);
  return def === undefined || offersSection(def, features);
}

export function Unavailable({
  device,
  sectionId,
}: {
  readonly device: Device;
  readonly sectionId: string;
}): ReactNode {
  const def = SECTIONS.find((section) => section.id === sectionId);
  return (
    <EmptyState
      icon="info"
      title={NOT_AVAILABLE}
      body={def?.missing ?? `${device.label} doesn’t offer this yet.`}
    />
  );
}
