import type { ComputerFeature } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import type { RailEntry, RailGroup } from '../../../components/page-shell/section-rail';
import type { ShellSections } from '../../../components/page-shell/shell-sections';
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
  readonly features: readonly ComputerFeature[] | undefined;
}

function entryOf(def: SectionDef, missing: string | null): RailEntry {
  return { id: def.id, label: def.label, short: def.short, icon: def.icon, missing };
}

export function railGroupsOf({ features }: SectionsInput): readonly RailGroup[] {
  return [
    {
      title: null,
      entries: SECTIONS.map((def) =>
        entryOf(def, offersSection(def, features) ? null : NOT_AVAILABLE),
      ),
    },
    { title: 'AI on this computer', entries: AI_SECTIONS.map((def) => entryOf(def, null)) },
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
