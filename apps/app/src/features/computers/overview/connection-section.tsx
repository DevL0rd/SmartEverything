import type { ReactNode } from 'react';
import { useState } from 'react';
import { background } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { confirm } from '../../../components/confirm-store';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import type { Device } from '../../../store/state';
import { PairComputerSheet } from '../components/pair-computer-sheet';
import { useComputerAi } from '../data/computer-ai';
import { useRevokeComputer } from '../data/computer-overview';

function RevokeRow({ device }: { readonly device: Device }): ReactNode {
  const revoke = useRevokeComputer(device.id, device.label);
  const ask = async (): Promise<void> => {
    const accepted = await confirm({
      title: `Revoke ${device.label}’s connection?`,
      body: `${device.label} stops working with this hub until you pair it again. Its chats stay readable.`,
      confirmLabel: 'Revoke connection',
      tone: 'destructive',
    });
    if (accepted) revoke.mutate();
  };
  return (
    <ListRow
      title="Revoke computer connection"
      icon="ban"
      destructive
      disabled={revoke.isPending}
      onPress={() => {
        background(ask(), 'computer_overview.ask_failed');
      }}
    />
  );
}

export function ConnectionSection({
  device,
  owner,
}: {
  readonly device: Device;
  readonly owner: boolean;
}): ReactNode {
  const [pair, setPair] = useState(false);
  const ai = useComputerAi(device.id);
  return (
    <List title="Connection">
      {owner ? (
        <ListRow
          title="Pair another computer"
          icon="plus"
          chevron
          onPress={() => {
            setPair(true);
          }}
        />
      ) : (
        <ListRow
          title="Pair or revoke"
          icon="lock"
          subtitle="Only the owner can do this."
          disabled
        />
      )}
      <ListRow
        title="Access scopes"
        icon="shield"
        chevron
        disabled={!owner}
        subtitle={owner ? 'What the assistant may use here' : 'Only the owner can use this.'}
        href={href.settings.device(device.id, 'scopes')}
      />
      {owner && ai.data?.local === false ? <RevokeRow device={device} /> : null}
      <PairComputerSheet
        open={pair}
        onClose={() => {
          setPair(false);
        }}
      />
    </List>
  );
}
