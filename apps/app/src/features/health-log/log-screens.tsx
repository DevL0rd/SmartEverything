import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useScreenQuery } from '../../queries/use-screen-query';
import type { HealthEntryRow } from '@smarteverything/domain';
import { href } from '../../app-shell/hrefs';
import { Banner } from '../../components/banner';
import { Button } from '../../components/button';
import { ErrorState } from '../../components/error-state';
import { FlowFrame } from '../../components/flow-frame';
import { NavRow } from '../../components/rows';
import { List } from '../../components/section';
import { Skeleton } from '../../components/skeleton';
import { Text } from '../../components/text';
import { entryKey } from '../../queries/health-entries';
import { readMinute } from '../../store/clock';
import { findEntry } from './entry-read';
import { saveProblemOf, useEntryWrites, useRetryEntry } from './entry-writes';
import { entryOfForm, initialTime, initialValues } from './form-values';
import { LOG_FORMS, LOG_GROUPS, logFormOf, type LogForm } from './forms';
import { LogFields, LogTimeFields } from './log-fields';
import { background } from '@smarteverything/logging';

function useEntry(id: string | undefined): {
  readonly entry: HealthEntryRow | null;
  readonly loading: boolean;
  readonly error: Error | null;
} {
  const query = useScreenQuery({
    queryKey: entryKey(id ?? ''),
    queryFn: () => findEntry(id ?? ''),
    enabled: id !== undefined,
    retry: false,
  });
  return {
    entry: query.data ?? null,
    loading: id !== undefined && query.isPending,
    error: query.error,
  };
}

function SaveProblem({ entry }: { readonly entry: HealthEntryRow }): ReactNode {
  const retry = useRetryEntry();
  const problem = saveProblemOf(entry);
  return problem === null ? null : (
    <Banner
      tone="warning"
      title={problem}
      action={{
        label: 'Try again',
        onPress: (): void => {
          retry(entry);
        },
      }}
    />
  );
}

function EditorFooter({
  entry,
  busy,
  onSave,
  onRemove,
}: {
  readonly entry: HealthEntryRow | null;
  readonly busy: boolean;
  readonly onSave: () => void;
  readonly onRemove: () => void;
}): ReactNode {
  return (
    <>
      {entry === null ? null : (
        <Button label="Remove" variant="destructive" icon="trash" onPress={onRemove} />
      )}
      <Button label="Save" icon="check" grow loading={busy} onPress={onSave} />
    </>
  );
}

function useFinish(): (work: Promise<unknown>) => void {
  const router = useRouter();
  return (work): void => {
    background(
      work.then((done) => {
        if (done !== null && done !== false) {
          router.back();
        }
      }),
      'log_screens.background_failed',
    );
  };
}

function LogEditor({
  form,
  entry,
}: {
  readonly form: LogForm;
  readonly entry: HealthEntryRow | null;
}): ReactNode {
  const router = useRouter();
  const writes = useEntryWrites();
  const [values, setValues] = useState(initialValues(form, entry));
  const [time, setTime] = useState(() => initialTime(form, entry, readMinute()));
  const finish = useFinish();
  const input = entryOfForm(form, values, time);
  return (
    <FlowFrame
      title={entry === null ? `Log ${form.title.toLowerCase()}` : form.title}
      onCancel={() => {
        router.back();
      }}
      footer={
        <EditorFooter
          entry={entry}
          busy={writes.busy}
          onSave={() => {
            finish(
              entry === null
                ? writes.create(input, `${form.title} logged`)
                : writes.update(entry, input),
            );
          }}
          onRemove={() => {
            finish(entry === null ? Promise.resolve(false) : writes.remove(entry, form.title));
          }}
        />
      }
    >
      <View className="gap-6">
        {entry === null ? null : <SaveProblem entry={entry} />}
        <LogFields form={form} values={values} onChange={setValues} />
        <LogTimeFields form={form} time={time} onChange={setTime} />
        <Text variant="footnote" tone="variant">
          Saved to your profile and, on your phone, to Health Connect.
        </Text>
      </View>
    </FlowFrame>
  );
}

function Notice({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}): ReactNode {
  const router = useRouter();
  return (
    <FlowFrame
      title={title}
      onCancel={() => {
        router.back();
      }}
    >
      {children}
    </FlowFrame>
  );
}

function Loaded({
  form,
  entryId,
}: {
  readonly form: LogForm;
  readonly entryId: string | undefined;
}): ReactNode {
  const found = useEntry(entryId);
  if (found.error !== null) {
    return (
      <Notice title={form.title}>
        <ErrorState error={found.error} />
      </Notice>
    );
  }
  if (found.loading) {
    return (
      <Notice title={form.title}>
        <Skeleton shape="block" className="h-72" />
      </Notice>
    );
  }
  if (entryId !== undefined && found.entry === null) {
    return (
      <Notice title={form.title}>
        <Text variant="callout" tone="variant">
          This entry was removed.
        </Text>
      </Notice>
    );
  }
  return <LogEditor form={form} entry={found.entry} />;
}

export function LogEntryScreen(): ReactNode {
  const params = useLocalSearchParams<{ type: string; entry?: string }>();
  const form = logFormOf(params.type);
  if (form === null) {
    return (
      <Notice title="Log health data">
        <Text variant="callout" tone="variant">
          This kind of health data can’t be logged by hand.
        </Text>
      </Notice>
    );
  }
  return <Loaded form={form} entryId={params.entry} />;
}

export function LogPickerScreen(): ReactNode {
  const router = useRouter();
  return (
    <FlowFrame
      title="Log health data"
      onCancel={() => {
        router.back();
      }}
    >
      <List inset>
        <NavRow title="Food & drink" icon="salad" href={href.logFood()} />
      </List>
      {LOG_GROUPS.map((group) => (
        <List key={group} title={group} inset>
          {LOG_FORMS.filter((form) => form.group === group).map((form) => (
            <NavRow
              key={form.type}
              title={form.title}
              icon={form.icon}
              href={href.logHealth(form.type)}
            />
          ))}
        </List>
      ))}
    </FlowFrame>
  );
}
