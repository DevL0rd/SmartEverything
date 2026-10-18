import type { ReactNode } from 'react';
import type { ComputerFeature } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import type { RailWidth } from '../../../components/frame-layout';
import {
  SectionRail as KitSectionRail,
  type RailEntry,
  type RailGroup,
} from '../../../components/section-rail';
import { Text } from '../../../components/text';
import { useChatCounts } from '../data/computer-overview';
import { useSectionSummary } from './section-summary';
import {
  AI_SECTIONS,
  SECTIONS,
  notAvailableOn,
  offersSection,
  type SectionDef,
} from '../model/sections';

export interface RailProps {
  readonly deviceId: string;
  readonly active: string;
  readonly online: boolean;
  readonly features: readonly ComputerFeature[] | undefined;
  readonly os: string | null;
  readonly width: RailWidth;
}

function SummaryText({
  deviceId,
  id,
  online,
  missing,
}: {
  readonly deviceId: string;
  readonly id: string;
  readonly online: boolean;
  readonly missing: string | null;
}): ReactNode {
  const text = useSectionSummary(deviceId, id, online, missing);
  return text === null ? null : (
    <Text variant="caption" tone="variant" numberOfLines={1} className="tabular">
      {text}
    </Text>
  );
}

function SessionsText({ deviceId }: { readonly deviceId: string }): ReactNode {
  const { running } = useChatCounts(deviceId);
  return running === 0 ? null : (
    <Text variant="caption" tone="variant" numberOfLines={1}>
      {`${String(running)} active`}
    </Text>
  );
}

function entryOf(def: SectionDef, missing: string | null, detail: ReactNode): RailEntry {
  return { id: def.id, label: def.label, short: def.short, icon: def.icon, missing, detail };
}

export function railGroupsOf(rail: RailProps): readonly RailGroup[] {
  const { deviceId, features, os, online } = rail;
  return [
    {
      title: null,
      entries: SECTIONS.map((def) => {
        const missing = offersSection(def, features) ? null : notAvailableOn(os);
        return entryOf(
          def,
          missing,
          <SummaryText deviceId={deviceId} id={def.id} online={online} missing={missing} />,
        );
      }),
    },
    {
      title: 'AI on this computer',
      entries: AI_SECTIONS.map((def) =>
        entryOf(
          def,
          null,
          def.id === 'claude-sessions' ? (
            <SessionsText deviceId={deviceId} />
          ) : (
            <SummaryText deviceId={deviceId} id={def.id} online={online} missing={null} />
          ),
        ),
      ),
    },
  ];
}

export function SectionRail(rail: RailProps): ReactNode {
  return (
    <KitSectionRail
      groups={railGroupsOf(rail)}
      active={rail.active}
      width={rail.width}
      hrefOf={(id) => href.settings.device(rail.deviceId, id)}
    />
  );
}
