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
import { useGridLayout } from '../../../components/grid';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { notifyFailure } from '../../../components/toast-store';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { isNative } from '../../../design/platform';
import { DETAIL_MIN_WIDTH } from '../../../design/size-class';
import { joinParts } from '../../../format/text';
import { relative } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { useRows } from '../../../store/selectors';
import { SettingsFrame } from '../../../settings/settings-frame';
import { useMutationState } from '../../../store/mutation';
import { confirmRevoke, useHubLive, useOfflineBanner } from './revoke-access';

import { trackConnection } from '../connections-log';
import { background } from '@smarteverything/logging';

const CREATE_FAILURE = 'No token was made';

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
      wrapTitle
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
  readonly failed: boolean;
  readonly close: () => void;
  readonly create: () => void;
  readonly canCreate: boolean;
  readonly readOnly: boolean;
  readonly setReadOnly: (readOnly: boolean) => void;
}

function useTokenDraft(onClose: () => void): TokenDraft {
  const [name, setName] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const mutation = useMutationState();
  const live = useHubLive();
  const trimmedName = name.trim();
  const canCreate = live && trimmedName !== '' && trimmedName.length <= 80;
  const close = (): void => {
    setName('');
    setReadOnly(false);
    setToken(null);
    setSubmitted(false);
    onClose();
  };
  const create = (): void => {
    if (!canCreate || mutation.busy) return;
    setSubmitted(true);
    mutation.run(() => createMcpToken(trimmedName, readOnly ? 'read' : 'control'), {
      failure: CREATE_FAILURE,
      inline: true,
      onDone: setToken,
    });
  };
  return {
    name,
    setName,
    token,
    busy: mutation.busy,
    failed: submitted && mutation.problem !== null,
    close,
    create,
    canCreate,
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
      {draft.failed ? <Banner tone="critical" title={CREATE_FAILURE} announceTitle /> : null}
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
  const { token, busy, close, create, canCreate } = draft;
  return (
    <Sheet
      open={open}
      onClose={close}
      title="New token"
      detents={['fit']}
      footer={
        token === null ? (
          <Button label="Create" disabled={!canCreate} loading={busy} onPress={create} />
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

function TokenLists({
  tokens,
  now,
}: {
  readonly tokens: readonly McpTokenRow[];
  readonly now: number;
}): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  const { columns } = useGridLayout(width, DETAIL_MIN_WIDTH, 'grid', tokens.length);
  return (
    <View onLayout={isNative() ? undefined : onLayout} className="gap-1">
      <View className="flex-row items-start gap-grid-gap">
        {Array.from({ length: columns }, (_, index) => {
          const start = Math.floor((index * tokens.length) / columns);
          const end = Math.floor(((index + 1) * tokens.length) / columns);
          return (
            <List inset key={index} className="min-w-0 max-w-reading flex-1">
              {tokens.slice(start, end).map((token) => (
                <TokenRow key={token.id} token={token} now={now} />
              ))}
            </List>
          );
        })}
      </View>
      <Text variant="footnote" tone="variant" className="px-4 pt-1">
        Each token lets one app use your home.
      </Text>
    </View>
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
      contentWidth={isNative() ? 'reading' : 'full'}
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
        <TokenLists tokens={tokens} now={now} />
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
