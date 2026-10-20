import type { AutomationSecretEntry, AutomationSecretInput } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { View } from 'react-native';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { background } from '@smarteverything/logging';
import { EmptyState } from '../../../components/empty-state';
import { Text } from '../../../components/text';
import { useSecretFlow } from './use-secret-flow';
import { SecretRow } from './secret-row';
import { SecretSheet } from './secret-sheet';
import {
  removeVerdict,
  secretRows,
  type SecretRowModel,
  type UsersBySecret,
} from './secrets-model';

export interface SecretsScreenProps {
  readonly owner: boolean;
  readonly entries: readonly AutomationSecretEntry[];
  readonly users: UsersBySecret;
  readonly now: Date;
  readonly onSave: (body: AutomationSecretInput) => Promise<void>;
  readonly onRemove: (secretId: string) => Promise<void>;
}

function Heading({
  owner,
  onAdd,
}: {
  readonly owner: boolean;
  readonly onAdd: () => void;
}): ReactNode {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="title-2">Secrets</Text>
        <Text variant="callout" tone="variant">
          Passwords and tokens that Web request nodes send. Values are write-only.
        </Text>
      </View>
      {owner ? <Button label="Add secret" icon="plus" onPress={onAdd} /> : null}
    </View>
  );
}

function Rows(props: {
  readonly rows: readonly SecretRowModel[];
  readonly refusedId: string | null;
  readonly onReplace: (row: SecretRowModel) => void;
  readonly onRemove: (row: SecretRowModel) => void;
}): ReactNode {
  return (
    <View className="gap-3">
      {props.rows.map((row) => {
        const verdict = props.refusedId === row.id ? removeVerdict(row) : null;
        return (
          <SecretRow
            key={row.id}
            row={row}
            readOnly={false}
            refusal={verdict === null || verdict.allowed ? null : verdict}
            onReplace={props.onReplace}
            onRemove={props.onRemove}
          />
        );
      })}
    </View>
  );
}

function ReadOnly({ rows }: { readonly rows: readonly SecretRowModel[] }): ReactNode {
  return (
    <View className="gap-3">
      <Banner
        tone="info"
        title="Only the home owner manages secrets"
        body="You can see which secrets exist and what uses them, not their values."
      />
      {rows.map((row) => (
        <SecretRow
          key={row.id}
          row={row}
          readOnly
          refusal={null}
          onReplace={noop}
          onRemove={noop}
        />
      ))}
    </View>
  );
}

function noop(): void {
  return undefined;
}

function Empty({ onAdd }: { readonly onAdd: () => void }): ReactNode {
  return (
    <EmptyState
      icon="key"
      title="No secrets yet"
      body="Add a token or password once, then pick it in a Web request node instead of typing it into the automation."
      action={<Button label="Add secret" icon="plus" onPress={onAdd} />}
    />
  );
}

export function SecretsScreen({
  owner,
  entries,
  users,
  now,
  onSave,
  onRemove,
}: SecretsScreenProps): ReactNode {
  const flow = useSecretFlow(onRemove);
  const rows = useMemo(() => secretRows(entries, users, now), [entries, users, now]);
  const listed = owner && rows.length > 0;
  return (
    <View className="gap-section-gap">
      <Heading owner={owner} onAdd={flow.add} />
      {flow.failure === null ? null : (
        <Banner tone="critical" title="Not removed" body={flow.failure} wrapBody />
      )}
      {owner ? null : <ReadOnly rows={rows} />}
      {owner && rows.length === 0 ? <Empty onAdd={flow.add} /> : null}
      {listed ? (
        <Rows
          rows={rows}
          refusedId={flow.refusedId}
          onReplace={flow.replace}
          onRemove={(row) => {
            background(flow.remove(row), 'secret.remove_failed');
          }}
        />
      ) : null}
      <SecretSheet
        open={owner ? flow.editing.kind !== 'closed' : false}
        replacing={flow.editing.kind === 'replace' ? flow.editing.row : null}
        entries={entries}
        onClose={flow.close}
        onSave={onSave}
      />
    </View>
  );
}
