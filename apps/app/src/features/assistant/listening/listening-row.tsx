import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { ClaimStripe } from './claim-stripe';
import {
  KIND_ICONS,
  lookOf,
  switchable,
  type ListeningRow,
  type StateLook,
} from './listening-model';
import { pauseNote } from './pause-note';
import type { RowActions } from './row-actions';
import { RowSwitches } from './row-switches';
import { StateMark } from './state-mark';

function StateLine({
  look,
  row,
}: {
  readonly look: StateLook;
  readonly row: ListeningRow;
}): ReactNode {
  const note = pauseNote(row.source);
  return (
    <>
      <View className="min-w-0 flex-row items-center gap-1.5">
        <StateMark mark={look.mark} />
        <Text
          variant="footnote"
          tone={look.category === 'need' ? 'warning' : 'variant'}
          numberOfLines={1}
        >
          {look.label}
        </Text>
      </View>
      {note === null ? null : (
        <View className="flex-row items-center gap-1.5">
          <Icon name="warning" size={16} tone="warning" />
          <Text variant="footnote" tone="warning" className="flex-1">
            {note}
          </Text>
        </View>
      )}
    </>
  );
}

function RowBody({
  row,
  look,
}: {
  readonly row: ListeningRow;
  readonly look: StateLook;
}): ReactNode {
  const blocked = row.state === 'blocked';
  return (
    <>
      <Icon
        name={look.icon ?? KIND_ICONS[row.source.kind]}
        size={20}
        tone={look.category === 'need' ? 'warning' : blocked ? 'faint' : 'variant'}
      />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="body" tone={blocked ? 'variant' : 'default'} numberOfLines={1}>
          {row.source.name}
        </Text>
        <StateLine look={look} row={row} />
      </View>
      {blocked ? null : <ClaimStripe claims={row.source.claims} name={row.source.name} />}
      <View className="medium:hidden">
        <Icon name="chevronRight" size={20} tone="faint" />
      </View>
    </>
  );
}

export function SourceRow({
  row,
  actions,
}: {
  readonly row: ListeningRow;
  readonly actions: RowActions;
}): ReactNode {
  const look = lookOf(row.state, actions.offline);
  return (
    <View className="medium:flex-row medium:items-center">
      <Interactive
        role="button"
        label={`${row.source.name}, ${look.label}. Show details`}
        onPress={() => {
          actions.onOpen(row.source.key);
        }}
        className="min-w-0 flex-row items-center gap-3 px-4 py-2.5 medium:min-h-14 medium:flex-1"
      >
        <RowBody row={row} look={look} />
      </Interactive>
      <RowSwitches row={row} actions={actions} switchable={switchable(row)} />
    </View>
  );
}
