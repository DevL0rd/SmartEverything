import type { ReactNode } from 'react';
import { memo, useEffect } from 'react';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import { scheduleOnUI } from 'react-native-worklets';
import { memberOutcomeText, type MemberOutcome } from '@smarteverything/domain';
import { bringIntoView } from '../../../components/bring-into-view';
import { Grid } from '../../../components/grid';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { useScreen } from '../../../components/screen-context';
import { View } from 'react-native';
import type { Device } from '../../../store/state';
import { DeviceFace } from '../../devices';
import { MAX_COLUMNS, MIN_ROW_WIDTH } from '../model/member-rows';

export interface Reveal {
  readonly id: string;
  readonly nonce: number;
}

const OutcomeNote = memo(function OutcomeNote({
  outcome,
}: {
  readonly outcome: MemberOutcome;
}): ReactNode {
  return (
    <View className="flex-row items-center gap-1.5 px-3 pb-1">
      <Icon
        name={outcome.status === 'failed' ? 'warning' : 'info'}
        size={16}
        colour={outcome.status === 'failed' ? 'warning' : 'on-surface-variant'}
      />
      <Text variant="footnote" tone="variant">
        {memberOutcomeText(outcome)}
      </Text>
    </View>
  );
});

export const MemberCell = memo(function MemberCell({
  member,
  expanded,
  outcome,
  onToggle,
}: {
  readonly member: Device;
  readonly expanded: boolean;
  readonly outcome: MemberOutcome | null;
  readonly onToggle: (deviceId: string) => void;
}): ReactNode {
  return (
    <>
      <DeviceFace
        deviceId={member.id}
        face={expanded ? 'row-expanded' : 'row'}
        context="nested"
        onToggleExpand={() => {
          onToggle(member.id);
        }}
      />
      {outcome === null ? null : <OutcomeNote outcome={outcome} />}
    </>
  );
});

const MemberRow = memo(function MemberRow({
  member,
  expanded,
  reveal,
  outcome,
  onToggle,
}: {
  readonly member: Device;
  readonly expanded: boolean;
  readonly reveal: number;
  readonly outcome: MemberOutcome | null;
  readonly onToggle: (deviceId: string) => void;
}): ReactNode {
  const ref = useAnimatedRef<Animated.View>();
  const { scrollRef, scrollY } = useScreen();
  useEffect(() => {
    if (reveal === 0 || scrollRef === null) return undefined;
    const frame = requestAnimationFrame(() => {
      scheduleOnUI(bringIntoView, ref, scrollRef, scrollY);
    });
    return (): void => {
      cancelAnimationFrame(frame);
    };
  }, [reveal, ref, scrollRef, scrollY]);
  return (
    <Animated.View ref={ref} collapsable={false}>
      <MemberCell member={member} expanded={expanded} outcome={outcome} onToggle={onToggle} />
    </Animated.View>
  );
});

export function MemberRows({
  members,
  expanded,
  reveal,
  outcomes,
  onToggle,
}: {
  readonly members: readonly Device[];
  readonly expanded: string | null;
  readonly reveal: Reveal | null;
  readonly outcomes: ReadonlyMap<string, MemberOutcome>;
  readonly onToggle: (deviceId: string) => void;
}): ReactNode {
  return (
    <Grid minItemWidth={MIN_ROW_WIDTH} maxColumns={MAX_COLUMNS} gap="tight">
      {members.map((member) => (
        <MemberRow
          key={member.id}
          member={member}
          expanded={expanded === member.id}
          reveal={reveal?.id === member.id ? reveal.nonce : 0}
          outcome={outcomes.get(member.id) ?? null}
          onToggle={onToggle}
        />
      ))}
    </Grid>
  );
}
