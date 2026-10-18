import type { ReactNode } from 'react';
import { COMPUTER_SCOPE_OFF, type ComputerScope } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import { EmptyState } from '../../../components/empty-state';
import { useDevice } from '../../../store/selectors';
import { factsOf } from '../data/computer-device';
import { useComputerDetail } from '../data/computer-metrics';
import { SECTIONS, notAvailableOn, offersSection } from '../model/sections';

export function SectionGate({
  deviceId,
  section,
  scope,
  children,
}: {
  readonly deviceId: string;
  readonly section: string;
  readonly scope: ComputerScope;
  readonly children: ReactNode;
}): ReactNode {
  const device = useDevice(deviceId);
  const detail = useComputerDetail(deviceId, device?.online === true).data;
  const def = SECTIONS.find((candidate) => candidate.id === section);
  if (def !== undefined && !offersSection(def, detail?.features)) {
    return (
      <EmptyState
        icon={def.icon}
        title={def.missing ?? 'Not available on this computer'}
        body={notAvailableOn(device === null ? null : factsOf(device).os)}
      />
    );
  }
  if (detail?.scopes[scope] === false) {
    return (
      <Banner
        tone="info"
        title={COMPUTER_SCOPE_OFF[scope]}
        action={{ label: 'Access scopes', href: href.settings.device(deviceId, 'scopes') }}
      />
    );
  }
  return children;
}
