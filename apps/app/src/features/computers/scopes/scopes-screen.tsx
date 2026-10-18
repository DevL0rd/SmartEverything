import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Banner } from '../../../components/banner';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { ReasonLine } from '../../../components/reason-line';
import { SwitchRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Skeleton } from '../../../components/skeleton';
import { ComputerFrame } from '../components/computer-frame';
import {
  useComputerReach,
  useComputerScopeChange,
  useComputerScopes,
} from '../data/computer-scopes';
import { SCOPE_ROWS, scopeTitle } from './scope-rows';
import { background } from '@smarteverything/logging';

function ScopeList({
  deviceId,
  name,
}: {
  readonly deviceId: string;
  readonly name: string;
}): ReactNode {
  const scopes = useComputerScopes(deviceId, true);
  const change = useComputerScopeChange(deviceId, scopeTitle);
  if (scopes.isError) {
    return (
      <ErrorState
        error={scopes.error}
        retry={() => {
          background(scopes.refetch(), 'scopes.refetch_failed');
        }}
      />
    );
  }
  if (scopes.data === undefined) return <Skeleton shape="block" className="h-72" />;
  const saved = scopes.data;
  const asked = change.isPending ? change.variables : undefined;
  return (
    <List footer={`Turning one off takes effect on the next action on ${name}.`}>
      {SCOPE_ROWS.map((row) => {
        const busy = asked?.scope === row.scope;
        return (
          <SwitchRow
            key={row.scope}
            title={row.title}
            subtitle={busy ? 'Saving…' : row.description}
            value={busy ? asked.value : saved[row.scope]}
            disabled={busy}
            onChange={(next) => {
              change.mutate({ scope: row.scope, value: next });
            }}
          />
        );
      })}
    </List>
  );
}

export function ComputerScopesScreen({ deviceId }: { readonly deviceId: string }): ReactNode {
  const reach = useComputerReach(deviceId);
  return (
    <ComputerFrame deviceId={deviceId} title="Access scopes">
      {reach.owner ? (
        <View className="gap-4">
          <Banner
            tone="info"
            title="Applies to the app and the assistant"
            body={`These are the most either may do on ${reach.name}.`}
            wrapBody
          />
          <ReasonLine icon="lock" text="Only you can change these. The assistant can’t." />
          <ScopeList deviceId={deviceId} name={reach.name} />
        </View>
      ) : (
        <EmptyState
          icon="lock"
          title="Only the owner can change access"
          body={`What SmartEverything may do on ${reach.name} stays with the owner.`}
        />
      )}
    </ComputerFrame>
  );
}
