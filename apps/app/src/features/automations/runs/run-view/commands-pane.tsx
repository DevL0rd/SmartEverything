import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge, type BadgeTone } from '../../../../components/badge';
import { Text } from '../../../../components/text';
import type { Activation } from './run-activation';
import { memoryLines } from './run-values';
import { useCommand } from './use-command';

const COMMAND_TONE: Readonly<Record<string, BadgeTone>> = {
  succeeded: 'positive',
  failed: 'critical',
  expired: 'warning',
  running: 'info',
  pending: 'neutral',
};

const COMMAND_WORD: Readonly<Record<string, string>> = {
  succeeded: 'Done',
  failed: 'Failed',
  expired: 'Timed out',
  running: 'Sending',
  pending: 'Waiting',
};

export const REMEMBERS_COPY =
  'What this node remembers from earlier runs. It cannot be changed here.';

function CommandRow({ id }: { readonly id: string }): ReactNode {
  const { row, query } = useCommand(id);
  if (row === null) {
    return (
      <Text variant="footnote" tone={query.isError ? 'critical' : 'variant'}>
        {query.isError ? 'This command could not be loaded.' : 'Loading command…'}
      </Text>
    );
  }
  return (
    <View className="gap-1 rounded-sm bg-surface-2 p-2">
      <View className="flex-row items-center justify-between gap-2">
        <Text variant="body-strong" numberOfLines={1} className="min-w-0 flex-1">
          {row.capability}
        </Text>
        <Badge
          label={COMMAND_WORD[row.status] ?? row.status}
          tone={COMMAND_TONE[row.status] ?? 'neutral'}
        />
      </View>
      {row.error === null ? null : (
        <Text variant="footnote" tone="critical" selectable>
          {row.error}
        </Text>
      )}
    </View>
  );
}

export function CommandList({ ids }: { readonly ids: readonly string[] }): ReactNode {
  if (ids.length === 0) return null;
  return (
    <View className="gap-2">
      <Text variant="footnote" tone="variant" accessibilityRole="header">
        Commands sent
      </Text>
      {ids.map((id) => (
        <CommandRow key={id} id={id} />
      ))}
    </View>
  );
}

export function Remembers({ activation }: { readonly activation: Activation | null }): ReactNode {
  const lines = memoryLines(activation);
  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between gap-2">
        <Text variant="footnote" tone="variant" accessibilityRole="header">
          Remembers
        </Text>
        <Badge label="Kept between runs" tone="neutral" />
      </View>
      {lines.length === 0 ? (
        <Text variant="body">Nothing remembered yet.</Text>
      ) : (
        lines.map((line) => (
          <View key={line.label} className="flex-row justify-between gap-2">
            <Text variant="body" tone="variant">
              {line.label}
            </Text>
            <Text variant="body-strong" className="tabular">
              {line.value}
            </Text>
          </View>
        ))
      )}
      <Text variant="caption" tone="variant">
        {REMEMBERS_COPY}
      </Text>
    </View>
  );
}

export interface NodePaneProps {
  readonly title: string;
  readonly activation: Activation | null;
  readonly stateful: boolean;
}

export function NodePane({ title, activation, stateful }: NodePaneProps): ReactNode {
  const error = activation?.error ?? null;
  return (
    <View className="gap-3 rounded-md bg-surface-1 p-3">
      <Text variant="body-strong">{title}</Text>
      {activation === null ? (
        <Text variant="footnote" tone="variant">
          This step did not run.
        </Text>
      ) : null}
      {error === null ? null : (
        <Text variant="footnote" tone="critical" selectable>
          {error}
        </Text>
      )}
      <CommandList ids={activation?.commandIds ?? []} />
      {stateful ? <Remembers activation={activation} /> : null}
    </View>
  );
}
