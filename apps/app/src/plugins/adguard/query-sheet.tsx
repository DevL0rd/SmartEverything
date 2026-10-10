import type { AdGuardQuery } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { ActionRow, ValueRow } from '../../components/rows';
import { List } from '../../components/section';
import { Sheet } from '../../components/sheet';
import { joinParts } from '../../format/text';
import { clock } from '../../format/time';
import { useAdGuardTools } from './adguard-data';
import { OUTCOME_TEXT } from './query-outcome';

function hasOwnRule(rules: readonly string[], domain: string): boolean {
  const own = new Set([`||${domain}^`, `@@||${domain}^`]);
  return rules.some((rule) => own.has(rule.trim()));
}

function RuleActions({
  query,
  rules,
  done,
}: {
  readonly query: AdGuardQuery;
  readonly rules: readonly string[];
  readonly done: () => void;
}): ReactNode {
  const tools = useAdGuardTools();
  const domain = query.domain.replace(/\.$/, '');
  const own = hasOwnRule(rules, domain);
  const run = (tool: string): void => {
    done();
    void tools.run(tool, { domain });
  };
  return (
    <List title="This domain">
      {query.outcome === 'blocked' ? null : (
        <ActionRow
          title="Block it"
          icon="shield"
          onPress={() => {
            run('block_domain');
          }}
        />
      )}
      {query.outcome === 'blocked' ? (
        <ActionRow
          title="Always allow it"
          icon="check"
          destructive
          onPress={() => {
            run('allow_domain');
          }}
        />
      ) : null}
      {own ? (
        <ActionRow
          title="Remove my rule"
          icon="undo"
          onPress={() => {
            run('remove_domain_rule');
          }}
        />
      ) : null}
    </List>
  );
}

export function QuerySheet({
  query,
  rules,
  onClose,
}: {
  readonly query: AdGuardQuery | null;
  readonly rules: readonly string[];
  readonly onClose: () => void;
}): ReactNode {
  return (
    <Sheet open={query !== null} onClose={onClose} title={query?.domain ?? 'Lookup'} scroll>
      {query === null ? null : (
        <View className="gap-section-gap">
          <List>
            <ValueRow title="Result" value={OUTCOME_TEXT[query.outcome]} />
            <ValueRow title="When" value={clock(query.time)} />
            <ValueRow title="Device" value={joinParts([query.clientName, query.client])} />
            <ValueRow title="Type" value={query.type} />
            {query.rule === null ? null : <ValueRow title="Rule" value={query.rule} />}
            {query.elapsedMs === null ? null : (
              <ValueRow title="Answer time" value={`${String(query.elapsedMs)} ms`} />
            )}
          </List>
          <RuleActions query={query} rules={rules} done={onClose} />
        </View>
      )}
    </Sheet>
  );
}
