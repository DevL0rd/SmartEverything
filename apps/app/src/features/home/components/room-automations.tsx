import type { ReactNode } from 'react';
import { href } from '../../../app-shell/hrefs';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';

export function RoomAutomations({ roomId }: { readonly roomId: string }): ReactNode {
  return (
    <List title="Automations" inset className="w-full max-w-reading self-start">
      <ListRow
        title="Set up an automation"
        subtitle="Start from a template for this room"
        icon="automations"
        iconTone="primary"
        href={href.automationNewFor({ roomId })}
        chevron
      />
    </List>
  );
}
