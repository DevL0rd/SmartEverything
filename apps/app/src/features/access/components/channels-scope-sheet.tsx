import type { ReactNode } from 'react';
import { useState } from 'react';
import { SwitchRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { notifyFailure } from '../../../components/toast-store';
import { useRows } from '../../../store/selectors';
import { scopesChange, toggled } from '../model/scopes';
import { EditorSheet, type EditorProps } from './editor-sheet';

export function ChannelsScopeSheet({ access, actions, onClose }: EditorProps): ReactNode {
  const channels = useRows('talk_channels');
  const [only, setOnly] = useState(access.scopes.channels.mode === 'only');
  const [ids, setIds] = useState<readonly string[]>(access.scopes.channels.ids);
  return (
    <EditorSheet
      title="Walkie-talkie channels"
      intro="Choose where this person can hear and speak."
      onClose={onClose}
      onSave={() => {
        actions
          .change(
            access.profile_id,
            scopesChange(access, { channels: { mode: only ? 'only' : 'all', ids: [...ids] } }),
          )
          .catch(notifyFailure('The channels were not saved'));
      }}
    >
      <SwitchRow title="Only the channels ticked below" value={only} onChange={setOnly} />
      {only ? (
        <List title="Channels">
          {channels.map((channel) => (
            <SwitchRow
              key={channel.id}
              title={channel.name}
              value={ids.includes(channel.id)}
              onChange={() => {
                setIds((now) => toggled(now, channel.id));
              }}
            />
          ))}
        </List>
      ) : null}
    </EditorSheet>
  );
}
