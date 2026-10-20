import { useMemo, type ReactNode } from 'react';
import type { AutomationSecretUser } from '@smarteverything/domain';
import { useMinute } from '../../../store/clock';
import { useIsOwner } from '../../../store/selectors';
import { useAutomations } from '../data/use-automations';
import { useSecretActions, useSecrets } from '../data/use-secrets';
import { useKindOf } from '../detail/use-detail-data';
import { manifestFor } from '../detail/detail-model';
import { SecretsScreen } from '../secrets/secrets-screen';
import { usersBySecret } from '../secrets/secrets-model';
import { PageShell } from './page-shell';
import { useFunctionLookup } from './use-environment';

function useUsersOfSecrets(): ReadonlyMap<string, readonly AutomationSecretUser[]> {
  const { rows } = useAutomations();
  const kindOf = useKindOf();
  const functions = useFunctionLookup();
  return useMemo(
    () =>
      usersBySecret(
        rows.flatMap((row) =>
          (manifestFor(row.definition, kindOf, functions)?.uses.secret ?? []).map(
            (secretId) => [secretId, { automationId: row.id, name: row.name }] as const,
          ),
        ),
      ),
    [rows, kindOf, functions],
  );
}

export function SecretsHost(): ReactNode {
  const owner = useIsOwner();
  const secrets = useSecrets(owner);
  const actions = useSecretActions();
  const users = useUsersOfSecrets();
  const now = useMinute();
  const entries = useMemo(() => secrets.data ?? [], [secrets.data]);
  return (
    <PageShell title="Secrets">
      <SecretsScreen
        owner={owner}
        entries={entries}
        users={users}
        now={new Date(now)}
        onSave={async (body) => {
          await actions.set(body);
        }}
        onRemove={actions.remove}
      />
    </PageShell>
  );
}
