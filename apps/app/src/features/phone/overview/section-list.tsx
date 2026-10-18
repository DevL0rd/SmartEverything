import type { ReactNode } from 'react';
import { href } from '../../../app-shell/hrefs';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { usePhoneSummary } from '../frame/phone-rail';
import { PHONE_SECTIONS, type PhoneSectionDef } from '../model/sections';

function SectionRow({
  deviceId,
  def,
  online,
}: {
  readonly deviceId: string;
  readonly def: PhoneSectionDef;
  readonly online: boolean;
}): ReactNode {
  const subtitle = usePhoneSummary(deviceId, def.id, online);
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
}: {
  readonly deviceId: string;
  readonly online: boolean;
}): ReactNode {
  return (
    <List title="Sections">
      {PHONE_SECTIONS.slice(1).map((def) => (
        <SectionRow key={def.id} deviceId={deviceId} def={def} online={online} />
      ))}
    </List>
  );
}
