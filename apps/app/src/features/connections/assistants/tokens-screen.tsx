import { ReadOnlyRow } from './read-only-row';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import type { McpTokenRow } from '@smarteverything/domain';
import { createMcpToken, revokeMcpToken } from '../../../api/access';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { IconButton } from '../../../components/icon-button';
import { CodeBlock } from '../../../components/code';
import { EmptyState } from '../../../components/empty-state';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { Sheet } from '../../../components/sheet';
import { TextField } from '../../../components/text-field';
import { notifyFailure } from '../../../components/toast-store';
import { joinParts } from '../../../format/text';
import { relative } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { useRows } from '../../../store/selectors';
import { SettingsFrame } from '../../../settings/settings-frame';
import { useMutationState } from '../../../store/mutation';
import { confirmRevoke, useHubLive, useOfflineBanner } from './revoke-access';

import { trackConnection } from '../connections-log';
import { background } from '@smarteverything/logging';
function revoke(token: McpTokenRow): void {
  background(
    confirmRevoke(token.name).then((accepted) => {
      if (accepted) {
        trackConnection('mcp_token.revoke', { tokenId: token.id }, () =>
          revokeMcpToken(token.id),
        ).catch(notifyFailure('The token wasn’t revoked'));
      }
    }),
    'revoke.confirm_failed',
  );
}

function TokenRow({
  token,
  now,
}: {
  readonly token: McpTokenRow;
  readonly now: number;
}): ReactNode {
  const live = useHubLive();
  const onRevoke = (): void => {
    revoke(token);
  };
  return (
    <ListRow
      icon="key"
      title={token.name}
      subtitle={joinParts([
        `Made ${relative(token.created_at, now)}`,
        token.access === 'read' ? 'Read only' : null,
        token.last_used_at === null ? 'Never used' : `Used ${relative(token.last_used_at, now)}`,
      ])}
      trailing={
        <IconButton
          icon="trash"
          label={`Revoke ${token.name}`}
          disabled={!live}
          onPress={onRevoke}
        />
      }
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
  readonly readOnly: boolean;
  readonly setReadOnly: (readOnly: boolean) => void;
}

function useTokenDraft(onClose: () => void): TokenDraft {
  const [name, setName] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const mutation = useMutationState();
  const close = (): void => {
    setName('');
    setReadOnly(false);
    setToken(null);
    onClose();
  };
  const create = (): void => {
    mutation.run(() => createMcpToken(name.trim(), readOnly ? 'read' : 'control'), {
      failure: 'No token was made',
      onDone: setToken,
    });
  };
  const valid = name.trim() !== '' && name.trim().length <= 80;
  return {
    name,
    setName,
    token,
    busy: mutation.busy,
    close,
    create,
    valid,
    readOnly,
    setReadOnly,
  };
}

function TokenForm({ draft }: { readonly draft: TokenDraft }): ReactNode {
  return (
    <View className="gap-3">
      <TextField
        label="Name"
        placeholder="App that will use it"
        helper="So you know which app or script uses it"
        value={draft.name}
        onChange={draft.setName}
        onSubmit={draft.create}
        focusOnMount
      />
      <ReadOnlyRow who="It" value={draft.readOnly} onChange={draft.setReadOnly} />
    </View>
  );
}

function CreateSheet({
  open,
  onClose,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
}): ReactNode {
  const draft = useTokenDraft(onClose);
  const { token, busy, close, create, valid } = draft;
  const live = useHubLive();
  return (
    <Sheet
      open={open}
      onClose={close}
      title="New token"
      detents={['fit']}
      footer={
        token === null ? (
          <Button label="Create" disabled={!valid || !live} loading={busy} onPress={create} />
        ) : (
          <Button label="Done" onPress={close} />
        )
      }
    >
      {token === null ? (
        <TokenForm draft={draft} />
      ) : (
        <View className="gap-3">
          <Banner
            tone="warning"
            title="Copy it now"
            body="You won’t see this token again. Store it like a password."
            wrapBody
          />
          <CodeBlock label="Token" code={token} />
        </View>
      )}
    </Sheet>
  );
}

export function TokensScreen(): ReactNode {
  const tokens = useRows('mcp_tokens').filter((token) => token.revoked_at === null);
  const now = useMinute();
  const [creating, setCreating] = useState(false);
  const banner = useOfflineBanner();
  return (
    <SettingsFrame
      page="assistant/integrations/tokens"
      {...(banner === undefined ? {} : { banner })}
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
