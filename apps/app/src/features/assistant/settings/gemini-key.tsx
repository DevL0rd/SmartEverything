import type { ReactNode } from 'react';
import { useState } from 'react';
import { GEMINI_KEY, type AssistantVoiceStatus } from '@smarteverything/domain';
import { confirm } from '../../../components/confirm-store';
import { LoadedQuery } from '../../../components/loaded-query';
import { ListRow } from '../../../components/list-row';
import { ActionRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { useIsOwner } from '../../../store/selectors';
import { useGeminiActions, useGeminiStatus, type GeminiActions } from './gemini-key-data';
import { KeyPasteSheet, MEMBER_FOOTER, runKeyAction } from './key-paste-sheet';
import { background } from '@smarteverything/logging';

function PasteRow({ replace }: { readonly replace: boolean }): ReactNode {
  const { saveKey } = useGeminiActions();
  const [pasting, setPasting] = useState(false);
  return (
    <>
      <ActionRow
        title={replace ? 'Replace the Gemini key' : 'Paste a Gemini key'}
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
        label="Gemini key"
        placeholder="AIza…"
        helper="Create one at aistudio.google.com › API keys. It stays on your server."
        saved="Gemini key saved"
        valid={(key) => GEMINI_KEY.safeParse(key).success}
        save={saveKey}
      />
    </>
  );
}

function RemoveRow(): ReactNode {
  const { removeKey } = useGeminiActions();
  const remove = async (): Promise<void> => {
    const sure = await confirm({
      title: 'Remove the Gemini key?',
      body: 'Voice calls and spoken lines stop working until you add a key again.',
      confirmLabel: 'Remove key',
      tone: 'destructive',
    });
    if (sure) {
      await runKeyAction(removeKey, 'Gemini key removed');
    }
  };
  return (
    <ActionRow
      title="Remove the Gemini key"
      icon="trash"
      destructive
      onPress={() => {
        background(remove(), 'gemini_key.remove_failed');
      }}
    />
  );
}

function ownerRows(status: AssistantVoiceStatus, importKey: GeminiActions['importKey']): ReactNode {
  const set = status.key === 'set';
  const importable = !set && status.sources.includes('aibinator');
  return (
    <>
      <PasteRow replace={set} />
      {importable ? (
        <ActionRow
          title="Import from AiBinator"
          subtitle="Copies the key from AiBinator on this computer."
          icon="download"
          onPress={() => {
            background(runKeyAction(importKey, 'Gemini key imported'), 'key_action.run_failed');
          }}
        />
      ) : null}
      {set ? <RemoveRow /> : null}
    </>
  );
}

function KeyRows({ status }: { readonly status: AssistantVoiceStatus }): ReactNode {
  const owner = useIsOwner();
  const { importKey } = useGeminiActions();
  const set = status.key === 'set';
  return (
    <List inset title="Gemini key" {...(owner ? {} : { footer: MEMBER_FOOTER })}>
      <ListRow
        title={set ? 'Gemini key added' : 'No Gemini key yet'}
        icon="key"
        iconTone={set ? 'positive' : 'warning'}
        subtitle={
          set ? 'Voice calls and spoken lines are ready.' : 'Voice calls need a Gemini key.'
        }
      />
      {owner ? ownerRows(status, importKey) : null}
    </List>
  );
}

export function GeminiKeySection(): ReactNode {
  return (
    <LoadedQuery query={useGeminiStatus()}>{(status) => <KeyRows status={status} />}</LoadedQuery>
  );
}
