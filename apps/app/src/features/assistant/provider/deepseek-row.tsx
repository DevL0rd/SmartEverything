import type { ReactNode } from 'react';
import { useState } from 'react';
import { background } from '@smarteverything/logging';
import { confirm } from '../../../components/confirm-store';
import { ListRow } from '../../../components/list-row';
import { ActionRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { useIsOwner } from '../../../store/selectors';
import { KeyPasteSheet, MEMBER_FOOTER, runKeyAction } from '../settings/key-paste-sheet';

export interface DeepSeekKeyActions {
  readonly saveKey: (key: string) => Promise<unknown>;
  readonly removeKey: () => Promise<unknown>;
}

export function deepSeekKeyUsable(key: string): boolean {
  const trimmed = key.trim();
  return trimmed.length > 0 && !/\s/.test(trimmed);
}

export function deepSeekStatusLine(set: boolean): string {
  return set ? 'DeepSeek models are ready.' : 'Add a key so the assistant can use DeepSeek models.';
}

function PasteRow({
  set,
  actions,
}: {
  readonly set: boolean;
  readonly actions: DeepSeekKeyActions;
}): ReactNode {
  const [pasting, setPasting] = useState(false);
  return (
    <>
      <ActionRow
        title={set ? 'Replace the DeepSeek key' : 'Paste a DeepSeek key'}
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
        label="DeepSeek key"
        placeholder="sk-…"
        helper="Create one at platform.deepseek.com › API keys. It stays on your server."
        saved="DeepSeek key saved"
        valid={deepSeekKeyUsable}
        save={actions.saveKey}
      />
    </>
  );
}

function RemoveRow({ actions }: { readonly actions: DeepSeekKeyActions }): ReactNode {
  const remove = async (): Promise<void> => {
    const sure = await confirm({
      title: 'Remove the DeepSeek key?',
      body: 'DeepSeek models stop answering until you add a key again.',
      confirmLabel: 'Remove key',
      tone: 'destructive',
    });
    if (sure) await runKeyAction(actions.removeKey, 'DeepSeek key removed');
  };
  return (
    <ActionRow
      title="Remove the DeepSeek key"
      icon="trash"
      destructive
      onPress={() => {
        background(remove(), 'deepseek_key.remove_failed');
      }}
    />
  );
}

export function DeepSeekRow({
  set,
  actions,
}: {
  readonly set: boolean;
  readonly actions: DeepSeekKeyActions;
}): ReactNode {
  const owner = useIsOwner();
  return (
    <List inset title="DeepSeek key" {...(owner ? {} : { footer: MEMBER_FOOTER })}>
      <ListRow
        title={set ? 'DeepSeek key added' : 'No DeepSeek key yet'}
        icon="key"
        iconTone={set ? 'positive' : 'warning'}
        subtitle={deepSeekStatusLine(set)}
      />
      {owner ? <PasteRow set={set} actions={actions} /> : null}
      {owner && set ? <RemoveRow actions={actions} /> : null}
    </List>
  );
}
