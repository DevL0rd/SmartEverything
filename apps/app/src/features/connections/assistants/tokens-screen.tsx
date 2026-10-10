import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import type { McpTokenRow } from '@smarteverything/domain';
import { createMcpToken, revokeMcpToken } from '../../../api/access';
import { Button } from '../../../components/button';
import { CodeBlock } from '../../../components/code';
import { confirm } from '../../../components/confirm-store';
import { EmptyState } from '../../../components/empty-state';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { notify } from '../../../components/toast-store';
import { joinParts } from '../../../format/text';
import { relative } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { useRows } from '../../../store/selectors';
import { SettingsFrame } from '../../../settings/settings-frame';
import { useMutationState } from '../../../store/mutation';

function revoke(token: McpTokenRow): void {
  void confirm({
    title: `Revoke ${token.name}?`,
    body: 'Apps using it stop working at once.',
    confirmLabel: 'Revoke',
    tone: 'destructive',
  }).then((accepted) => {
    if (accepted) {
      revokeMcpToken(token.id).catch((error: unknown) => {
        notify({ message: 'The token wasn’t revoked', error, tone: 'critical' });
      });
    }
  });
}

function TokenRow({
  token,
  now,
}: {
  readonly token: McpTokenRow;
  readonly now: number;
}): ReactNode {
  const onRevoke = (): void => {
    revoke(token);
  };
  return (
    <ListRow
      icon="key"
      title={token.name}
      subtitle={joinParts([
        `Made ${relative(token.created_at, now)}`,
        token.last_used_at === null ? 'Never used' : `Used ${relative(token.last_used_at, now)}`,
      ])}
      trailing={<Button label="Revoke" variant="text" onPress={onRevoke} />}
    />
  );
}

interface TokenDraft {
  readonly name: string;
  readonly setName: (name: string) => void;
  readonly token: string | null;
  readonly busy: boolean;
  readonly close: () => void;
  readonly create: () => void;
  readonly valid: boolean;
}

function useTokenDraft(onClose: () => void): TokenDraft {
  const [name, setName] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const mutation = useMutationState();
  const close = (): void => {
    setName('');
    setToken(null);
    onClose();
  };
  const create = (): void => {
    mutation.run(() => createMcpToken(name.trim()), {
      failure: 'No token was made',
      onDone: setToken,
    });
  };
  const valid = name.trim() !== '' && name.trim().length <= 80;
  return { name, setName, token, busy: mutation.busy, close, create, valid };
}

function CreateSheet({
  open,
  onClose,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
}): ReactNode {
  const { name, setName, token, busy, close, create, valid } = useTokenDraft(onClose);
  return (
    <Sheet
      open={open}
      onClose={close}
      title="New token"
      detents={['fit']}
      footer={
        token === null ? (
          <Button label="Create" disabled={!valid} loading={busy} onPress={create} />
        ) : (
          <Button label="Done" onPress={close} />
        )
      }
    >
      {token === null ? (
        <TextField
          label="Name"
          placeholder="App that will use it"
          value={name}
          onChange={setName}
          onSubmit={create}
          focusOnMount
        />
      ) : (
        <View className="gap-3">
          <CodeBlock label="Token" code={token} />
          <Text variant="footnote" tone="variant">
            Shown once. Copy it now.
          </Text>
        </View>
      )}
    </Sheet>
  );
}

export function TokensScreen(): ReactNode {
  const tokens = useRows('mcp_tokens').filter((token) => token.revoked_at === null);
  const now = useMinute();
  const [creating, setCreating] = useState(false);
  return (
    <SettingsFrame
      page="assistant/integrations/tokens"
      primaryAction={{
        label: 'New token',
        icon: 'plus',
        onPress: () => {
          setCreating(true);
        },
      }}
    >
      {tokens.length === 0 ? (
        <EmptyState
          icon="key"
          title="No tokens"
          body="Assistant connections make their own. Make one here for other apps."
        />
      ) : (
        <List inset footer="Each token lets one app use your home.">
          {tokens.map((token) => (
            <TokenRow key={token.id} token={token} now={now} />
          ))}
        </List>
      )}
      <CreateSheet
        open={creating}
        onClose={() => {
          setCreating(false);
        }}
      />
    </SettingsFrame>
  );
}
