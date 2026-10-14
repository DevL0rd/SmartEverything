import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { OPENROUTER_KEY, type OpenRouterStatus } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { confirm } from '../../../components/confirm-store';
import { ErrorState } from '../../../components/error-state';
import { ListRow } from '../../../components/list-row';
import { Sheet } from '../../../components/sheet';
import { Skeleton } from '../../../components/skeleton';
import { TextField } from '../../../components/text-field';
import { notify } from '../../../components/toast-store';
import { errorText } from '../../../format/errors';
import { joinParts, plural } from '../../../format/text';
import { ActionRow } from '../../../components/rows';
import { useOpenRouterActions, useOpenRouterStatus } from '../data/openrouter';

interface KeyDraft {
  readonly key: string;
  readonly setKey: (key: string) => void;
  readonly error: string | null;
  readonly saving: boolean;
  readonly valid: boolean;
  readonly save: () => Promise<void>;
}

function useKeyDraft(onSaved: () => void): KeyDraft {
  const { saveKey } = useOpenRouterActions();
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      await saveKey(key.trim());
      notify({ message: 'OpenRouter key saved', tone: 'positive' });
      setKey('');
      onSaved();
    } catch (cause) {
      setError(errorText(cause).title);
    } finally {
      setSaving(false);
    }
  };
  return {
    key,
    setKey,
    error,
    saving,
    valid: OPENROUTER_KEY.safeParse(key).success,
    save,
  };
}

function KeySheet({
  open,
  onClose,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
}): ReactNode {
  const { key, setKey, error, saving, valid, save } = useKeyDraft(onClose);
  const footer = (
    <Button
      label="Check and save"
      grow
      loading={saving}
      disabled={!valid}
      onPress={() => void save()}
    />
  );
  return (
    <Sheet open={open} onClose={onClose} title="Paste your key" detents={['fit']} footer={footer}>
      <View className="gap-3 pb-2">
        <TextField
          label="OpenRouter key"
          kind="password"
          value={key}
          onChange={setKey}
          {...(valid ? { onSubmit: () => void save() } : {})}
          placeholder="sk-or-…"
          helper="Create one at openrouter.ai › Keys. It stays on your server."
          error={error}
          focusOnMount
        />
      </View>
    </Sheet>
  );
}

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

async function run(action: () => Promise<unknown>, done: string): Promise<void> {
  try {
    await action();
    notify({ message: done, tone: 'positive' });
  } catch (error) {
    notify({ message: 'That didn’t work', error });
  }
}

export function KeyStatusRow({
  context = 'chat',
}: { readonly context?: 'chat' | 'images' } = {}): ReactNode {
  const status = useOpenRouterStatus();
  if (status.isError) {
    return <ErrorState error={status.error} retry={() => void status.refetch()} />;
  }
  if (status.data === undefined) {
    return <Skeleton shape="line" className="h-12" />;
  }
  const set = status.data.key === 'set';
  return (
    <ListRow
      title={set ? 'Key added' : 'No key yet'}
      icon="key"
      iconTone={set ? 'positive' : 'warning'}
      subtitle={statusLine(status.data, context)}
    />
  );
}

export function PasteKeyRow(): ReactNode {
  const status = useOpenRouterStatus();
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
      <KeySheet
        open={pasting}
        onClose={() => {
          setPasting(false);
        }}
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
      await run(removeKey, 'OpenRouter key removed');
    }
  };
  return (
    <ActionRow title="Remove the key" icon="trash" destructive onPress={() => void remove()} />
  );
}
