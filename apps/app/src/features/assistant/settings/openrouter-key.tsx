import type { ReactNode } from 'react';
import { useState } from 'react';
import { OPENROUTER_KEY, type OpenRouterStatus } from '@smarteverything/domain';
import { confirm } from '../../../components/confirm-store';
import { LoadedQuery } from '../../../components/loaded-query';
import { ListRow } from '../../../components/list-row';
import { joinParts, plural } from '../../../format/text';
import { ActionRow } from '../../../components/rows';
import { useOpenRouterActions, useOpenRouterStatus } from '../data/openrouter';
import { KeyPasteSheet, runKeyAction } from './key-paste-sheet';
import { background } from '@smarteverything/logging';

function statusLine(status: OpenRouterStatus, context: 'chat' | 'images'): string {
  if (context === 'images')
    return status.key === 'missing'
      ? 'Add an OpenRouter key to use a metered image provider.'
      : 'Key configured. Image requests use separate metered credit.';
  if (status.key === 'missing') {
    return 'Add a key so the assistant can answer with any model.';
  }
  return joinParts(['Connected', status.models > 0 ? plural(status.models, 'model') : null]);
}

export function KeyStatusRow({
  context = 'chat',
}: { readonly context?: 'chat' | 'images' } = {}): ReactNode {
  return (
    <LoadedQuery query={useOpenRouterStatus()}>
      {(status) => (
        <ListRow
          title={status.key === 'set' ? 'Key added' : 'No key yet'}
          icon="key"
          iconTone={status.key === 'set' ? 'positive' : 'warning'}
          subtitle={statusLine(status, context)}
        />
      )}
    </LoadedQuery>
  );
}

export function PasteKeyRow(): ReactNode {
  const status = useOpenRouterStatus();
  const { saveKey } = useOpenRouterActions();
  const [pasting, setPasting] = useState(false);
  return (
    <>
      <ActionRow
        title={status.data?.key === 'set' ? 'Replace the key' : 'Paste a key'}
        icon="pencil"
        onPress={() => {
          setPasting(true);
        }}
      />
      <KeyPasteSheet
        open={pasting}
        onClose={() => {
          setPasting(false);
        }}
        label="OpenRouter key"
        placeholder="sk-or-…"
        helper="Create one at openrouter.ai › Keys. It stays on your server."
        saved="OpenRouter key saved"
        valid={(key) => OPENROUTER_KEY.safeParse(key).success}
        save={saveKey}
      />
    </>
  );
}

export function RemoveKeyRow(): ReactNode {
  const { removeKey } = useOpenRouterActions();
  const remove = async (): Promise<void> => {
    const sure = await confirm({
      title: 'Remove the OpenRouter key?',
      body: 'Chats that use OpenRouter stop answering until you add a key again.',
      confirmLabel: 'Remove key',
      tone: 'destructive',
    });
    if (sure) {
      await runKeyAction(removeKey, 'OpenRouter key removed');
    }
  };
  return (
    <ActionRow
      title="Remove the key"
      icon="trash"
      destructive
      onPress={() => {
        background(remove(), 'openrouter_key.remove_failed');
      }}
    />
  );
}
