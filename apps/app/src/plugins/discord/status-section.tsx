import { usePluginScreen } from '../shared/plugin-log';
import type { ReactNode } from 'react';
import { Badge } from '../../components/badge';
import { Banner } from '../../components/banner';
import { ListRow } from '../../components/list-row';
import { List } from '../../components/section';
import { plural } from '../../format/text';
import { VoiceCalls } from './call-rows';
import { GATEWAY_TEXT, useDiscordStatus } from './discord-data';

export function DiscordStatusSection(): ReactNode {
  usePluginScreen('discord', 'DiscordStatusSection');
  const stream = useDiscordStatus();
  if (stream.state !== 'ready') {
    return null;
  }
  const status = stream.value;
  const gateway = GATEWAY_TEXT[status.gateway];
  return (
    <>
      {status.gateway === 'error' && status.detail !== null ? (
        <Banner tone="critical" title="Discord is not connected" body={status.detail} wrapBody />
      ) : null}
      {status.voiceNotice === null ? null : (
        <Banner tone="warning" title="Voice is unavailable" body={status.voiceNotice} wrapBody />
      )}
      <List inset title="Status">
        <ListRow
          icon="plug"
          title="Discord"
          trailing={<Badge label={gateway.title} tone={gateway.tone} />}
        />
        <ListRow icon="bot" title="Bot" subtitle={status.botName ?? 'Not known yet'} />
        <ListRow icon="users" title="Servers" value={plural(status.serverCount, 'server')} />
        {status.droppedMessages > 0 ? (
          <ListRow
            icon="alert"
            title="Messages skipped when busy"
            value={String(status.droppedMessages)}
          />
        ) : null}
      </List>
      <VoiceCalls calls={status.calls} />
    </>
  );
}
