import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { SAMSUNG_TV_CREDENTIALS, type TableRow } from '@smarteverything/domain';
import { linkProvider } from '../../../api/providers';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { FlowFrame } from '../../../components/flow-frame';
import { ProgressSteps, type ProgressStep } from '../../../components/progress-steps';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { useProviderLink, useRow } from '../../../store/selectors';
import { rawErrorText } from '../../../format/errors';

type Outcome =
  | { readonly kind: 'working' }
  | { readonly kind: 'done' }
  | { readonly kind: 'failed'; readonly reason: string };

function linkOutcome(link: TableRow<'provider_links'> | null): Outcome {
  if (link?.status === 'linked') {
    return { kind: 'done' };
  }
  if (link?.status === 'linking') {
    return { kind: 'working' };
  }
  return { kind: 'failed', reason: link?.last_error ?? 'The TV did not answer' };
}

function outcomeOf(
  command: TableRow<'commands'> | null,
  link: TableRow<'provider_links'> | null,
): Outcome {
  if (command === null || command.status === 'pending' || command.status === 'running') {
    return { kind: 'working' };
  }
  if (command.status !== 'succeeded') {
    return { kind: 'failed', reason: command.error ?? 'The TV did not answer' };
  }
  return linkOutcome(link);
}

function stepsOf(outcome: Outcome): readonly ProgressStep[] {
  const failed = outcome.kind === 'failed';
  const done = outcome.kind === 'done';
  return [
    { label: 'Reaching the TV', state: done ? 'done' : failed ? 'failed' : 'active' },
    { label: 'Allow on the TV if it asks', state: done ? 'done' : 'waiting' },
  ];
}

interface Form {
  readonly name: string;
  readonly host: string;
  readonly macAddress: string;
}

const EMPTY: Form = { name: '', host: '', macAddress: '' };

function Fields({
  form,
  onForm,
  problem,
}: {
  readonly form: Form;
  readonly onForm: (form: Form) => void;
  readonly problem: string | null;
}): ReactNode {
  return (
    <View className="gap-4">
      <Text variant="callout" tone="variant">
        For devices on your network that no account brings in. Works with Samsung TVs today.
      </Text>
      <TextField
        label="Name"
        value={form.name}
        onChange={(name) => {
          onForm({ ...form, name });
        }}
        placeholder="What you call it"
        focusOnMount
      />
      <TextField
        label="IP address"
        kind="text"
        value={form.host}
        onChange={(host) => {
          onForm({ ...form, host });
        }}
        placeholder="From its network settings"
      />
      <TextField
        label="MAC address"
        kind="text"
        value={form.macAddress}
        onChange={(macAddress) => {
          onForm({ ...form, macAddress });
        }}
        placeholder="Six pairs like 00:11:22:33:44:55"
        helper="Lets your server turn it on"
        error={problem}
      />
      <Text variant="footnote" tone="variant">
        On a Samsung TV, turn on Power On with Mobile under Settings › General › Network.
      </Text>
    </View>
  );
}

function Progress({ commandId }: { readonly commandId: string }): ReactNode {
  const command = useRow('commands', commandId);
  const link = useProviderLink('samsung_tv');
  const outcome = outcomeOf(command, link);
  if (outcome.kind === 'done') {
    return <EmptyState icon="tv" title="Device added" body="It is in Devices now." />;
  }
  return (
    <View className="gap-4">
      <ProgressSteps steps={stepsOf(outcome)} />
      {outcome.kind === 'failed' ? <Banner tone="critical" title={outcome.reason} /> : null}
    </View>
  );
}

function useAddTv(): {
  readonly busy: boolean;
  readonly problem: string | null;
  readonly commandId: string | null;
  readonly submit: (form: Form) => void;
} {
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [commandId, setCommandId] = useState<string | null>(null);
  const submit = (form: Form): void => {
    const parsed = SAMSUNG_TV_CREDENTIALS.safeParse({
      provider: 'samsung_tv',
      name: form.name.trim(),
      host: form.host.trim(),
      macAddress: form.macAddress.trim(),
    });
    if (!parsed.success) {
      setProblem('Fill in all three; the MAC address looks like 00:11:22:33:44:55');
      return;
    }
    setBusy(true);
    setProblem(null);
    linkProvider(parsed.data).then(
      (command) => {
        setBusy(false);
        setCommandId(command.id);
      },
      (error: unknown) => {
        setBusy(false);
        setProblem(rawErrorText(error));
      },
    );
  };
  return { busy, problem, commandId, submit };
}

export function AddByAddressFlow(): ReactNode {
  const router = useRouter();
  const [form, setForm] = useState<Form>(EMPTY);
  const { busy, problem, commandId, submit } = useAddTv();
  const close = (): void => {
    router.back();
  };
  return (
    <FlowFrame
      title="Add by address"
      onCancel={close}
      footer={
        commandId === null ? (
          <>
            <Button label="Cancel" variant="text" onPress={close} />
            <Button
              label="Add"
              loading={busy}
              onPress={() => {
                submit(form);
              }}
            />
          </>
        ) : (
          <Button label="Done" onPress={close} />
        )
      }
    >
      {commandId === null ? (
        <Fields form={form} onForm={setForm} problem={problem} />
      ) : (
        <Progress commandId={commandId} />
      )}
    </FlowFrame>
  );
}
