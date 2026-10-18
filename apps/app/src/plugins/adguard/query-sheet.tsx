import { usePluginScreen } from '../shared/plugin-log';
import type { AdGuardQuery } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { z } from 'zod';
import { notify } from '../../components/toast-store';
import { ListRow } from '../../components/list-row';
import { ReasonLine } from '../../components/reason-line';
import { ValueRow } from '../../components/rows';
import { List } from '../../components/section';
import { Sheet } from '../../components/sheet';
import { Text } from '../../components/text';
import { joinParts } from '../../format/text';
import { useMinute } from '../../store/clock';
import { useIsOwner } from '../../store/selectors';
import { PluginActionRow } from '../shared/plugin-action';
import { useAdGuardTools } from './adguard-data';
import { OUTCOME_LOOK, OUTCOME_TEXT, ownRulesOf, plainDomain, whenText } from './query-outcome';

const DONE = z.looseObject({ done: z.string() });

function Rule({ rule }: { readonly rule: string }): ReactNode {
  return (
    <View className="min-h-row-h-2 justify-center gap-0.5 px-4 py-2">
      <Text variant="callout" tone="variant">
        Rule
      </Text>
      <Text variant="footnote" selectable className="font-mono">
        {rule}
      </Text>
    </View>
  );
}

function Facts({ query }: { readonly query: AdGuardQuery }): ReactNode {
  const look = OUTCOME_LOOK[query.outcome];
  const now = useMinute();
  return (
    <>
      <ListRow
        title="Result"
        icon={look.icon}
        iconTone={look.tone}
        value={OUTCOME_TEXT[query.outcome]}
      />
      <ValueRow title="When" value={whenText(query.time, now)} />
      <ValueRow title="Type" value={query.type} />
      {query.rule === null ? null : <Rule rule={query.rule} />}
      {query.elapsedMs === null ? null : (
        <ValueRow title="Answer time" value={`${String(query.elapsedMs)} ms`} />
      )}
      {query.upstream === null ? null : <ValueRow title="Upstream" value={query.upstream} />}
      <ValueRow title="Cached" value={query.cached ? 'Yes' : 'No'} />
    </>
  );
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
  const domain = plainDomain(query.domain);
  const own = ownRulesOf(rules, domain);
  const run = async (tool: string, failure: string): Promise<unknown> => {
    done();
    const result = await tools.run(tool, { domain }, failure);
    const parsed = DONE.safeParse(result);
    if (parsed.success) {
      notify({ message: parsed.data.done });
    }
    return result;
  };
  return (
    <List title="This domain">
      {query.outcome === 'blocked' || own.includes(`||${domain}^`) ? null : (
        <PluginActionRow
          title="Block it"
          icon="ban"
          onPress={() => run('block_domain', `${domain} wasn’t blocked`)}
        />
      )}
      {own.includes(`@@||${domain}^`) ? null : (
        <PluginActionRow
          title="Always allow it"
          icon="circleCheck"
          onPress={() => run('allow_domain', `${domain} wasn’t allowed`)}
        />
      )}
      {own.length === 0 ? null : (
        <PluginActionRow
          title="Remove my rule"
          subtitle={`Removes ${own.join(' and ')}`}
          icon="undo"
          onPress={() => run('remove_domain_rule', 'The rule wasn’t removed')}
        />
      )}
    </List>
  );
}

export function QuerySheet({
  query,
  rules,
  onClose,
  onDevice,
}: {
  readonly query: AdGuardQuery | null;
  readonly rules: readonly string[];
  readonly onClose: () => void;
  readonly onDevice: (query: AdGuardQuery) => void;
}): ReactNode {
  usePluginScreen('adguard', 'QuerySheet');
  const owner = useIsOwner();
  return (
    <Sheet
      open={query !== null}
      onClose={onClose}
      title={query === null ? 'Lookup' : plainDomain(query.domain)}
      scroll
    >
      {query === null ? null : (
        <View className="gap-section-gap">
          <List>
            <Facts query={query} />
            <ListRow
              title="Device"
              value={joinParts([query.clientName, query.client])}
              chevron
              onPress={() => {
                onDevice(query);
              }}
            />
          </List>
          {owner ? (
            <RuleActions query={query} rules={rules} done={onClose} />
          ) : (
            <ReasonLine icon="lock" text="Only the home’s owner can block or allow domains." />
          )}
        </View>
      )}
    </Sheet>
  );
}
