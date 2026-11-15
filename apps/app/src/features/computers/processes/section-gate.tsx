import type { ReactNode } from 'react';
import { COMPUTER_SCOPE_OFF, type ComputerScope } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import { EmptyState } from '../../../components/empty-state';
import { useDevice } from '../../../store/selectors';
import { useComputerDetail } from '../data/computer-metrics';
import { NOT_AVAILABLE, SECTIONS, offersSection, type SectionDef } from '../model/sections';

export type SectionState =
  | { readonly kind: 'open' }
  | { readonly kind: 'missing'; readonly def: SectionDef }
  | { readonly kind: 'off' };

export function useSectionState(
  deviceId: string,
  section: string,
  scope: ComputerScope,
): SectionState {
  const device = useDevice(deviceId);
  const detail = useComputerDetail(deviceId, device?.online === true).data;
  const def = SECTIONS.find((candidate) => candidate.id === section);
  if (def !== undefined && !offersSection(def, detail?.features)) return { kind: 'missing', def };
  if (detail?.scopes[scope] === false) return { kind: 'off' };
  return { kind: 'open' };
}

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
  const state = useSectionState(deviceId, section, scope);
  if (state.kind === 'missing') {
    return (
      <EmptyState
        icon={state.def.icon}
        title={NOT_AVAILABLE}
        body={state.def.missing ?? 'This computer does not offer it yet.'}
      />
    );
  }
  if (state.kind === 'off') {
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
