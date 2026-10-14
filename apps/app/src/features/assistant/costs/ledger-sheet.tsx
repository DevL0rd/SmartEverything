import type { ReactNode } from 'react';
import { View } from 'react-native';
import {
  USAGE_SOURCE_LABELS,
  USAGE_WORK_LABELS,
  type UsageLedgerRow,
} from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { Figure } from '../../../components/figure';
import { List } from '../../../components/section';
import { ValueRow } from '../../../components/rows';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { count } from '../../../format/number';
import { duration, longDate, clock } from '../../../format/time';
import { useMoney } from '../../region';
import { costStateLabel, titleOfRow } from './ledger-format';

interface Fact {
  readonly title: string;
  readonly value: string | null;
}

function factsOf(row: UsageLedgerRow, timeZone: string): readonly Fact[] {
  const ms = (value: number): string | null =>
    value > 0 ? duration(Math.round(value / 1000)) : null;
  const tokens = (value: number): string | null => (value > 0 ? count(value) : null);
  return [
    { title: 'When', value: `${longDate(row.at, timeZone)}, ${clock(row.at, timeZone)}` },
    { title: 'Person', value: row.profile.label },
    { title: 'Device', value: row.client?.label ?? null },
    { title: 'Model', value: row.model?.label ?? null },
    { title: 'Service', value: USAGE_SOURCE_LABELS[row.source] },
    { title: 'Type of work', value: USAGE_WORK_LABELS[row.work] },
    { title: 'Plugin', value: row.plugin?.label ?? null },
    { title: 'Usage', value: row.usage_available === false ? 'Supplier usage unavailable' : null },
    { title: 'Tokens in', value: tokens(row.tokens_in) },
    { title: 'Tokens out', value: tokens(row.tokens_out) },
    { title: 'Thinking tokens', value: tokens(row.tokens_reasoning) },
    { title: 'Listening', value: ms(row.audio_in_ms) },
    { title: 'Speaking', value: ms(row.audio_out_ms) },
    { title: 'Images', value: row.images > 0 ? count(row.images) : null },
    { title: 'Video', value: ms(row.video_ms) },
  ];
}

export interface LedgerSheetProps {
  readonly row: UsageLedgerRow | null;
  readonly timeZone: string;
  readonly onClose: () => void;
}

export function LedgerSheet({ row, timeZone, onClose }: LedgerSheetProps): ReactNode {
  const chat = row?.chat ?? null;
  const money = useMoney();
  return (
    <Sheet
      open={row !== null}
      onClose={onClose}
      title={row === null ? 'Request' : titleOfRow(row)}
      detents={['half', 'full']}
      {...(chat === null
        ? {}
        : {
            footer: (
              <Button
                label="Open the chat"
                icon="sparkles"
                grow
                href={href.assistantChat(chat.id)}
              />
            ),
          })}
    >
      {row === null ? null : (
        <View className="gap-4 pb-2">
          <View className="gap-0.5">
            <Figure
              value={row.cost_available === false ? 'Unavailable' : money.cost(row.cost_micros)}
              size="l"
            />
            <Text variant="caption" tone="variant">
              {row.cost_available === false
                ? 'Supplier cost unavailable; total is incomplete'
                : costStateLabel(row.cost_state)}
            </Text>
          </View>
          <List inset>
            {factsOf(row, timeZone)
              .filter((fact): fact is Fact & { readonly value: string } => fact.value !== null)
              .map((fact) => (
                <ValueRow key={fact.title} title={fact.title} value={fact.value} />
              ))}
          </List>
        </View>
      )}
    </Sheet>
  );
}
