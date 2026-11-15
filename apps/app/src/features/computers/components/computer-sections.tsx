import type { ReactNode } from 'react';
import type { ComputerFeature } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import type { RailEntry, RailGroup } from '../../../components/page-shell/section-rail';
import type { ShellSections } from '../../../components/page-shell/shell-sections';
import { Text } from '../../../components/text';
import { useSectionSummary } from './section-summary';
import {
  AI_SECTIONS,
  SECTIONS,
  NOT_AVAILABLE,
  offersSection,
  type SectionDef,
} from '../model/sections';

const PHONE_TABS: readonly string[] = ['overview', 'performance', 'processes', 'files', 'apps'];

export interface SectionsInput {
  readonly deviceId: string;
  readonly active: string;
  readonly online: boolean;
  readonly features: readonly ComputerFeature[] | undefined;
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

function entryOf(def: SectionDef, missing: string | null, detail: ReactNode): RailEntry {
  return { id: def.id, label: def.label, short: def.short, icon: def.icon, missing, detail };
}

export function railGroupsOf(input: SectionsInput): readonly RailGroup[] {
  const { deviceId, features, online } = input;
  return [
    {
      title: null,
      entries: SECTIONS.map((def) => {
        const missing = offersSection(def, features) ? null : NOT_AVAILABLE;
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
          <SummaryText deviceId={deviceId} id={def.id} online={online} missing={null} />,
        ),
      ),
    },
  ];
}

export function computerSectionsOf(input: SectionsInput): ShellSections {
  return {
    label: 'Computer pages',
    active: input.active,
    phoneTabs: PHONE_TABS,
    navigation: 'replace',
    hrefOf: (id) => href.settings.device(input.deviceId, id),
    groups: railGroupsOf(input),
  };
}
