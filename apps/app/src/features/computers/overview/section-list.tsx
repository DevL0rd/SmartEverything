import type { ReactNode } from 'react';
import type { ComputerFeature } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { useSectionSummary } from '../components/section-summary';
import { SECTIONS, notAvailableOn, offersSection, type SectionDef } from '../model/sections';

function SectionRow({
  deviceId,
  def,
  online,
  missing,
}: {
  readonly deviceId: string;
  readonly def: SectionDef;
  readonly online: boolean;
  readonly missing: string | null;
}): ReactNode {
  const subtitle = useSectionSummary(deviceId, def.id, online, missing);
  return (
    <ListRow
      title={def.label}
      icon={def.icon}
      chevron
      href={href.settings.device(deviceId, def.id)}
      {...(subtitle === null ? {} : { subtitle })}
    />
  );
}

export function SectionList({
  deviceId,
  online,
  features,
  os,
}: {
  readonly deviceId: string;
  readonly online: boolean;
  readonly features: readonly ComputerFeature[] | undefined;
  readonly os: string | null;
}): ReactNode {
  return (
    <List title="Sections">
      {SECTIONS.slice(1).map((def) => (
        <SectionRow
          key={def.id}
          deviceId={deviceId}
          def={def}
          online={online}
          missing={offersSection(def, features) ? null : notAvailableOn(os)}
        />
      ))}
    </List>
  );
}
