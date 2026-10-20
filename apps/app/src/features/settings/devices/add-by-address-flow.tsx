import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { SAMSUNG_TV_CREDENTIALS, type TableRow } from '@smarteverything/domain';
import { closeFlow } from '../../../app-shell/close-flow';
import { href } from '../../../app-shell/hrefs';
import { linkProvider } from '../../../api/providers';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { FlowFrame } from '../../../components/flow-frame';
import { ProgressSteps, type ProgressStep } from '../../../components/progress-steps';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { useMutationState } from '../../../store/mutation';
import { useProviderLink } from '../../../store/selectors';
import { stageOf } from '../../connections';

type Outcome =
  | { readonly kind: 'working' }
  | { readonly kind: 'done' }
  | { readonly kind: 'failed'; readonly reason: string };

function outcomeOf(link: TableRow<'provider_links'> | null, baseline: string | null): Outcome {
  const stage = stageOf(link, { baseline });
  if (stage.kind === 'done') {
    return { kind: 'done' };
  }
  return stage.kind === 'failed'
    ? { kind: 'failed', reason: stage.detail ?? 'The TV did not answer' }
    : { kind: 'working' };
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
}

const EMPTY: Form = { name: '', host: '' };

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
        helper="Keep it on: it asks you to allow the link, then tells the hub how to turn it on"
        error={problem}
      />
      <Text variant="footnote" tone="variant">
        On a Samsung TV, turn on Power On with Mobile under Settings › General › Network.
      </Text>
    </View>
  );
}

function Progress({ baseline }: { readonly baseline: string | null }): ReactNode {
  const outcome = outcomeOf(useProviderLink('samsung_tv'), baseline);
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
  readonly sent: { readonly baseline: string | null } | null;
  readonly submit: (form: Form) => void;
} {
  const [invalid, setInvalid] = useState<string | null>(null);
  const [sent, setSent] = useState<{ readonly baseline: string | null } | null>(null);
  const link = useProviderLink('samsung_tv');
  const mutation = useMutationState();
  const submit = (form: Form): void => {
    const parsed = SAMSUNG_TV_CREDENTIALS.safeParse({
      provider: 'samsung_tv',
      name: form.name.trim(),
      host: form.host.trim(),
    });
    if (!parsed.success) {
      setInvalid('Fill in the name and the IP address');
      return;
    }
    setInvalid(null);
    mutation.run(() => linkProvider(parsed.data), {
      failure: 'The TV was not added',
      inline: true,
      onDone: () => {
        setSent({ baseline: link?.updated_at ?? null });
      },
    });
  };
  return { busy: mutation.busy, problem: invalid ?? mutation.problem, sent, submit };
}

export function AddByAddressFlow(): ReactNode {
  const [form, setForm] = useState<Form>(EMPTY);
  const { busy, problem, sent, submit } = useAddTv();
  const close = (): void => {
    closeFlow(href.settings.index());
  };
  return (
    <FlowFrame
      title="Add by address"
      onCancel={close}
      footer={
        sent === null ? (
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
      {sent === null ? (
        <Fields form={form} onForm={setForm} problem={problem} />
      ) : (
        <Progress baseline={sent.baseline} />
      )}
    </FlowFrame>
  );
}
