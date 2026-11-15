import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { background, Logger } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { HScroller } from '../../../components/h-scroller';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { notify } from '../../../components/toast-store';
import { ActionBand } from '../../../components/widget-board';
import type { SemanticSizes } from '../../../design/tokens';
import { cn } from '../../../design/cn';
import { plural } from '../../../format/text';
import { useRunActions, type ByHand } from '../../automations';
import { chipGrid } from '../model/widget-fit';

const log = new Logger('app.home');

const RAN_MS = 3000;

function useRanAutomation(): {
  readonly ranId: string | null;
  readonly run: (automation: ByHand) => void;
} {
  const [ranId, setRanId] = useState<string | null>(null);
  const actions = useRunActions();
  useEffect(() => {
    if (ranId === null) {
      return undefined;
    }
    const timer = setTimeout(() => {
      setRanId(null);
    }, RAN_MS);
    return (): void => {
      clearTimeout(timer);
    };
  }, [ranId]);
  return {
    ranId,
    run: (automation): void => {
      setRanId(automation.id);
      background(
        actions.start({ automationId: automation.id, mode: 'live' }).then(
          (reply) => {
            if (!reply.ok) notify({ message: reply.summary, tone: 'critical' });
          },
          (error: unknown) => {
            log.error('home.automation_run_failed', error, { automationId: automation.id });
            notify({ message: `${automation.name} didn’t run`, tone: 'critical', error });
          },
        ),
        'home.automation_run',
      );
    },
  };
}

function RunChip({
  automation,
  ran,
  grow,
  onRun,
}: {
  readonly automation: ByHand;
  readonly ran: boolean;
  readonly grow: boolean;
  readonly onRun: (automation: ByHand) => void;
}): ReactNode {
  return (
    <Interactive
      label={`Run ${automation.name}`}
      onPress={() => {
        onRun(automation);
      }}
      className={cn(
        'min-h-touch-min flex-row items-center gap-2 rounded-lg pl-3 pr-4',
        ran ? 'bg-primary-container' : 'bg-surface-2',
        grow && 'min-w-0 flex-1',
      )}
      layerClassName="rounded-lg"
    >
      <Icon name={ran ? 'check' : 'play'} size={20} tone="primary" />
      <Text variant="label" tone={ran ? 'primary' : 'default'} numberOfLines={1} className="shrink">
        {automation.name}
      </Text>
    </Interactive>
  );
}

export function RunScroller({
  automations,
}: {
  readonly automations: readonly ByHand[];
}): ReactNode {
  const { ranId, run } = useRanAutomation();
  return (
    <HScroller label="Automations">
      {automations.map((automation) => (
        <RunChip
          key={automation.id}
          automation={automation}
          ran={ranId === automation.id}
          grow={false}
          onRun={run}
        />
      ))}
    </HScroller>
  );
}

function chunk<T>(items: readonly T[], size: number): readonly (readonly T[])[] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, row) =>
    items.slice(row * size, row * size + size),
  );
}

export function RunChipGrid({
  automations,
  columns,
  body,
  sizes,
}: {
  readonly automations: readonly ByHand[];
  readonly columns: number;
  readonly body: number;
  readonly sizes: SemanticSizes;
}): ReactNode {
  const { ranId, run } = useRanAutomation();
  const { shown, more } = chipGrid(body, automations.length, columns, sizes);
  return (
    <View className="flex-1 gap-3 overflow-hidden">
      <View className="gap-2">
        {chunk(automations.slice(0, shown), columns).map((row) => (
          <View key={row.map((automation) => automation.id).join()} className="flex-row gap-2">
            {row.map((automation) => (
              <RunChip
                key={automation.id}
                automation={automation}
                ran={ranId === automation.id}
                grow
                onRun={run}
              />
            ))}
            {Array.from({ length: columns - row.length }, (_, gap) => (
              <View key={`gap-${String(gap)}`} className="flex-1" />
            ))}
          </View>
        ))}
      </View>
      {more === 0 ? null : (
        <ActionBand>
          <Button label={`+${String(more)} more`} variant="text" href={href.automations()} />
        </ActionBand>
      )}
    </View>
  );
}

export function RunGlance({ automations }: { readonly automations: readonly ByHand[] }): ReactNode {
  const { ranId, run } = useRanAutomation();
  const [first] = automations;
  return (
    <View className="gap-1.5">
      <Text variant="footnote" tone="variant">
        {plural(automations.length, 'automation')}
      </Text>
      {first === undefined ? null : (
        <View className="flex-row">
          <RunChip automation={first} ran={ranId === first.id} grow onRun={run} />
        </View>
      )}
    </View>
  );
}
