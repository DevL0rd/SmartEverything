import type { ReactNode } from 'react';
import { href } from '../../../app-shell/hrefs';
import type { RailEntry } from '../../../components/page-shell/section-rail';
import type { ShellSections } from '../../../components/page-shell/shell-sections';
import { Text } from '../../../components/text';
import { sameJson } from '../../../store/same-json';
import { useDeviceDerived } from '../../../store/selectors';
import { railReadingsOf, railSummaryOf } from '../model/rail-summary';
import { PHONE_SECTIONS, type PhoneSectionDef, type PhoneSectionId } from '../model/sections';
import { phoneReadingsOf } from '../phone-values';

const PHONE_TABS: readonly PhoneSectionId[] = ['overview', 'battery', 'screen', 'apps', 'activity'];

export function usePhoneSummary(
  deviceId: string,
  id: PhoneSectionId,
  online: boolean,
): string | null {
  const live = useDeviceDerived(
    deviceId,
    (values) => railSummaryOf(id, railReadingsOf(phoneReadingsOf(values))),
    [id],
    sameJson,
  );
  if (id === 'overview' || id === 'apps' || id === 'setup') return null;
  return online ? live : 'Offline';
}

function SummaryText({
  deviceId,
  id,
  online,
}: {
  readonly deviceId: string;
  readonly id: PhoneSectionId;
  readonly online: boolean;
}): ReactNode {
  const text = usePhoneSummary(deviceId, id, online);
  return text === null ? null : (
    <Text variant="caption" tone="variant" numberOfLines={1} className="tabular">
      {text}
    </Text>
  );
}

function entryOf(def: PhoneSectionDef, deviceId: string, online: boolean): RailEntry {
  return {
    id: def.id,
    label: def.label,
    short: def.short,
    icon: def.icon,
    missing: null,
    detail: <SummaryText deviceId={deviceId} id={def.id} online={online} />,
  };
}

export function phoneSectionsOf({
  deviceId,
  active,
  online,
  hidden,
}: {
  readonly deviceId: string;
  readonly active: string;
  readonly online: boolean;
  readonly hidden: ReadonlySet<PhoneSectionId>;
}): ShellSections {
  return {
    label: 'Phone pages',
    active,
    phoneTabs: PHONE_TABS,
    navigation: 'replace',
    hrefOf: (id) => href.settings.device(deviceId, id),
    groups: [
      {
        title: null,
        entries: PHONE_SECTIONS.filter((def) => !hidden.has(def.id)).map((def) =>
          entryOf(def, deviceId, online),
        ),
      },
    ],
  };
}
