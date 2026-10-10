import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import {
  ICE_SERVER,
  WEBRTC_CANDIDATE,
  type IceServer,
  type SettingsRow,
} from '@smarteverything/domain';
import { updateRemoteViewing, type RemoteViewingChange } from '../../../api/media';
import { settingsTrail } from '../../../settings/tree';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { ListRow } from '../../../components/list-row';
import { PageHeader } from '../../../components/page-header';
import { SelectRow } from '../../../components/rows';
import { Screen } from '../../../components/screen';
import { List } from '../../../components/section';
import { TextField } from '../../../components/text-field';
import { notify } from '../../../components/toast-store';
import { useIsOwner, useSettings } from '../../../store/selectors';
import { useCameraPrefs } from '../data/use-camera-condition';
import { relaySupported } from '../player/rtc';

const CRUMBS = settingsTrail('cameras');

function saved(change: RemoteViewingChange): void {
  updateRemoteViewing(change).catch((error: unknown) => {
    notify({
      message: 'Remote viewing wasn’t changed',
      error,
      tone: 'critical',
    });
  });
}

function AwayMode(): ReactNode {
  const prefs = useCameraPrefs();
  if (!relaySupported()) {
    return (
      <List footer="This device always watches cameras directly.">
        <ListRow title="When you’re away" value="Direct" icon="globe" />
      </List>
    );
  }
  return (
    <List footer="Direct is fastest. Through your server works anywhere but uses more data and has no talk.">
      <SelectRow
        title="How to watch"
        icon="globe"
        value={prefs.value.awayMode}
        options={[
          { value: 'direct', label: 'Direct' },
          { value: 'server', label: 'Through your server' },
        ]}
        onChange={(awayMode) => {
          prefs.set({ awayMode });
        }}
      />
    </List>
  );
}

interface AddFieldProps {
  readonly label: string;
  readonly placeholder: string;
  readonly parse: (text: string) => Checked;
  readonly onAdd: (text: string) => void;
}

function AddField({ label, placeholder, parse, onAdd }: AddFieldProps): ReactNode {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const add = (): void => {
    const checked = parse(text.trim());
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    onAdd(text.trim());
    setText('');
    setError(null);
  };
  return (
    <View className="flex-row items-end gap-2 px-4 py-3">
      <View className="flex-1">
        <TextField
          label={label}
          value={text}
          placeholder={placeholder}
          kind="text"
          onChange={setText}
          onSubmit={add}
          {...(error === null ? {} : { error })}
        />
      </View>
      <Button label="Add" variant="tonal" disabled={text.trim() === ''} onPress={add} />
    </View>
  );
}

type Checked = { readonly ok: true } | { readonly ok: false; readonly error: string };

interface Schema {
  readonly safeParse: (value: unknown) => { readonly success: boolean };
}

function checkedWith(schema: Schema, message: string): (value: unknown) => Checked {
  return (value) =>
    schema.safeParse(value).success ? { ok: true } : { ok: false, error: message };
}

const ICE_CHECK = checkedWith(ICE_SERVER, 'Use a stun:, turn: or turns: address');
const CANDIDATE_CHECK = checkedWith(
  WEBRTC_CANDIDATE,
  'Use a host name or address, with :port if needed',
);

function IceServers({ servers }: { readonly servers: readonly IceServer[] }): ReactNode {
  return (
    <List title="Relay servers" footer="Help video reach you when you’re away from home.">
      {servers.map((server, index) => (
        <ListRow
          key={server.urls.join()}
          title={server.urls.join(', ')}
          {...(server.username === undefined ? {} : { subtitle: server.username })}
          trailing={
            <IconButton
              icon="trash"
              label="Remove"
              onPress={() => {
                saved({ ice_servers: servers.filter((_, other) => other !== index) });
              }}
            />
          }
        />
      ))}
      <AddField
        label="Add a server"
        placeholder="turn:relay.example.com"
        parse={(text) => ICE_CHECK({ urls: [text] })}
        onAdd={(text) => {
          saved({ ice_servers: [...servers, { urls: [text] }] });
        }}
      />
    </List>
  );
}

function Candidates({ candidates }: { readonly candidates: readonly string[] }): ReactNode {
  return (
    <List
      title="Extra addresses"
      footer="Public addresses your server can be reached on for video."
    >
      {candidates.map((candidate) => (
        <ListRow
          key={candidate}
          title={candidate}
          trailing={
            <IconButton
              icon="trash"
              label="Remove"
              onPress={() => {
                saved({ webrtc_candidates: candidates.filter((other) => other !== candidate) });
              }}
            />
          }
        />
      ))}
      <AddField
        label="Add an address"
        placeholder="home.example.com"
        parse={CANDIDATE_CHECK}
        onAdd={(text) => {
          saved({ webrtc_candidates: [...candidates, text] });
        }}
      />
    </List>
  );
}

function Advanced({ settings }: { readonly settings: SettingsRow }): ReactNode {
  const [open, setOpen] = useState(
    settings.ice_servers.length > 0 || settings.webrtc_candidates.length > 0,
  );
  return (
    <>
      <List inset>
        <ListRow
          icon="settings"
          title="Advanced"
          subtitle="Relay servers and extra addresses"
          trailing={<Icon name={open ? 'chevronUp' : 'chevronDown'} size={20} tone="faint" />}
          onPress={() => {
            setOpen(!open);
          }}
        />
      </List>
      {open ? <IceServers servers={settings.ice_servers} /> : null}
      {open ? <Candidates candidates={settings.webrtc_candidates} /> : null}
    </>
  );
}

export function RemoteViewingScreen(): ReactNode {
  const settings = useSettings();
  const owner = useIsOwner();
  return (
    <Screen header={<PageHeader title="Remote viewing" breadcrumbs={CRUMBS} />} maxWidth="reading">
      <AwayMode />
      {owner ? <Advanced settings={settings} /> : null}
    </Screen>
  );
}
