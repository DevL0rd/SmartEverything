import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Banner } from '../../../../components/banner';
import { Button } from '../../../../components/button';
import { NumberStepper } from '../../../../components/number-stepper';
import { SwitchRow } from '../../../../components/rows';
import { List } from '../../../../components/section';
import { Text } from '../../../../components/text';
import { decimal } from '../../../../format/number';
import type { HeaderEnv, HeaderSectionProps } from './header-types';
import type { LimitRow } from './budgets-model';
import {
  LIMIT_ROWS,
  STORM_OFF_NOTE,
  NO_LIMIT,
  limitAction,
  STORM_SWITCHES,
  isCustom,
  stormAllOff,
  limitValue,
  stormAllOn,
  stormOn,
  withLimit,
  withStorm,
} from './budgets-model';

function StormOffNote({ env }: { readonly env: HeaderEnv }): ReactNode {
  if (!stormAllOff(env.program)) return null;
  return (
    <View className="px-4">
      <Banner
        tone="warning"
        title={STORM_OFF_NOTE}
        body="Every start runs, even in a burst. Turning protection on can drop starts in a burst."
        wrapBody
        action={{
          label: 'Turn on',
          onPress: () => {
            if (env.locked) return;
            env.apply([stormAllOn(env.program.budgets)]);
          },
        }}
      />
    </View>
  );
}

function defaultText(row: LimitRow): string {
  return row.fallback === null ? 'No limit by default.' : `Default ${decimal(row.fallback, 0)}.`;
}

function LimitCard({ env, row }: { readonly env: HeaderEnv; readonly row: LimitRow }): ReactNode {
  const { budgets } = env.program;
  const value = limitValue(budgets, row);
  const action = limitAction(row, value, isCustom(budgets, row));
  return (
    <View className="gap-1 px-4 py-2">
      <Text variant="body-strong">{row.title}</Text>
      <Text variant="footnote" tone="variant">
        {`${row.explain} ${defaultText(row)}`}
      </Text>
      <View className="flex-row flex-wrap items-center gap-2">
        {value === null ? (
          <Text variant="body">{NO_LIMIT}</Text>
        ) : (
          <NumberStepper
            label={row.title}
            value={value}
            min={1}
            max={Number.MAX_SAFE_INTEGER}
            step={Math.max(1, Math.round(row.start / 10))}
            disabled={env.locked}
            onChange={(next) => {
              env.apply([withLimit(budgets, row.name, next)]);
            }}
          />
        )}
        {action === null ? null : (
          <Button
            label={action.label}
            variant="text"
            disabled={env.locked}
            onPress={() => {
              env.apply([withLimit(budgets, row.name, action.next)]);
            }}
          />
        )}
      </View>
    </View>
  );
}

export function BudgetsSection({ env }: HeaderSectionProps): ReactNode {
  const { budgets } = env.program;
  return (
    <View className="gap-3">
      <StormOffNote env={env} />
      <List title="Storm protection" footer="Keeps one automation from flooding the home.">
        {STORM_SWITCHES.map((entry) => (
          <SwitchRow
            key={entry.name}
            title={entry.title}
            subtitle={entry.explain}
            wrapSubtitle
            value={stormOn(budgets, entry.name)}
            disabled={env.locked}
            onChange={(on) => {
              env.apply([withStorm(budgets, entry.name, on)]);
            }}
          />
        ))}
      </List>
      <List
        title="Limits"
        footer="A run that goes past a limit you set stops. Only the command rate has a default."
      >
        {LIMIT_ROWS.map((row) => (
          <LimitCard key={row.name} env={env} row={row} />
        ))}
      </List>
    </View>
  );
}
