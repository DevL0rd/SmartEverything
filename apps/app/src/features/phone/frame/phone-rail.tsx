import type { ReactNode } from 'react';
import { href } from '../../../app-shell/hrefs';
import type { RailWidth } from '../../../components/frame-layout';
import {
  SectionRail as KitSectionRail,
  type RailEntry,
  type RailGroup,
} from '../../../components/section-rail';
import { Text } from '../../../components/text';
import { sameJson } from '../../../store/same-json';
import { useDeviceDerived } from '../../../store/selectors';
import { railReadingsOf, railSummaryOf } from '../model/rail-summary';
import { PHONE_SECTIONS, type PhoneSectionDef, type PhoneSectionId } from '../model/sections';
import { phoneReadingsOf } from '../phone-values';

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

export function PhoneRail({
  deviceId,
  active,
  online,
  hidden,
  width,
}: {
  readonly deviceId: string;
  readonly active: string;
  readonly online: boolean;
  readonly hidden: ReadonlySet<PhoneSectionId>;
  readonly width: RailWidth;
}): ReactNode {
  const groups: readonly RailGroup[] = [
    {
      title: null,
      entries: PHONE_SECTIONS.filter((def) => !hidden.has(def.id)).map((def) =>
        entryOf(def, deviceId, online),
      ),
    },
  ];
  return (
    <KitSectionRail
      groups={groups}
      active={active}
      width={width}
      hrefOf={(id) => href.settings.device(deviceId, id)}
    />
  );
}
