import type { BrushStateView, BrushingSession } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { Text } from '../../../components/text';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { cn } from '../../../design/cn';
import { relative } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import type { RestHeroProps } from '../../toothbrush/brand-ui';
import { HeroChips } from '../../toothbrush/components/hero-chips';
import { ModeChip } from '../../toothbrush/components/mode-chip';
import { PressureStrip } from '../../toothbrush/charts/pressure-strip';
import { clockText, linkLine } from '../../toothbrush/model/brush-model';
import { recapOf } from '../../toothbrush/model/session-model';
import { QuadrantArch, QuarterNotes } from '../charts/quadrant-arch';
import { ResultFace } from '../charts/result-face';
import { widthStyle } from '../charts/style';
import { archLabel } from '../model/arch-model';
import { recapViewOf, routineWord, type RecapView } from '../model/recap-model';
import { layoutOf } from '../model/stage-model';
import { HandleBox } from './handle-box';
import { OralbRestStrip } from './rest-strip';

function Arch({ recap, width }: { readonly recap: RecapView; readonly width: number }): ReactNode {
  if (recap.quarters === null) {
    return null;
  }
  return (
    <View className="gap-2" style={widthStyle(width)}>
      <QuadrantArch
        quarters={recap.quarters}
        big={recap.big}
        small={recap.small}
        width={width}
        moving={false}
        label={archLabel(recap.quarters, true)}
      />
      <QuarterNotes quarters={recap.quarters} />
      <Text variant="caption" tone="faint">
        {recap.caption}
      </Text>
    </View>
  );
}

function Result({
  session,
  view,
  recap,
}: {
  readonly session: BrushingSession;
  readonly view: BrushStateView;
  readonly recap: RecapView;
}): ReactNode {
  const now = useMinute();
  const runs = recapOf(session, view.profile).runs;
  return (
    <View className="min-w-0 flex-1 gap-3">
      <View className="flex-row flex-wrap items-center gap-2">
        <ModeChip brand="oralb" mode={session.mode} />
        <Badge
          label={routineWord(session)}
          tone={session.complete ? 'positive' : 'warning'}
          icon={session.complete ? 'check' : 'warning'}
        />
      </View>
      <Text variant="footnote" tone="variant" className="tabular">
        Last session {relative(session.startedAt, now)} · {clockText(session.durationS)}
      </Text>
      {recap.faceLine === null ? null : (
        <View className="flex-row items-center gap-3">
          <ResultFace face={recap.face} size={36} />
          <Text variant="callout" className="min-w-0 flex-1">
            {recap.faceLine}
          </Text>
        </View>
      )}
      {runs.length === 0 ? null : (
        <View className="gap-1">
          <Text variant="caption" tone="variant">
            Pressure over the last session
          </Text>
          <PressureStrip brand="oralb" runs={runs} seconds={session.durationS} />
        </View>
      )}
    </View>
  );
}

export function OralbRestHero({ deviceId, view, session }: RestHeroProps): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  const now = useMinute();
  const layout = layoutOf(width);
  const recap = recapViewOf(session);
  return (
    <View onLayout={onLayout} className="gap-4">
      <HeroChips deviceId={deviceId} view={view} linkShown />
      {width === 0 ? null : (
        <View className={cn('gap-4', layout.columns !== 'stacked' && 'flex-row items-start')}>
          <View className="flex-row items-center gap-4">
            <HandleBox deviceId={deviceId} view={view} px={layout.handlePx} />
            <Arch recap={recap} width={layout.archPx} />
          </View>
          <Result session={session} view={view} recap={recap} />
        </View>
      )}
      <Text variant="footnote" tone="variant">
        {linkLine(view, now)}
      </Text>
      <OralbRestStrip deviceId={deviceId} view={view} />
    </View>
  );
}
