import type { InclineScale, SessionDetail, TreadmillSession } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { Text } from '../../../components/text';
import { count, decimal } from '../../../format/number';
import { inclineText } from '../model/counters-model';
import { KIND_LABEL, sourceBadge } from '../model/session-model';
import { clockText, distanceFigure } from '../model/treadmill-model';

export interface Fact {
  readonly label: string;
  readonly value: string;
  readonly key: boolean;
  readonly note?: string;
  readonly violet?: boolean;
}

export function factsOf(session: TreadmillSession): readonly Fact[] {
  const steps =
    session.steps === null ? [] : [{ label: 'Steps', value: count(session.steps), key: true }];
  const shown = distanceFigure(session.distanceM);
  const energy =
    session.kcal === null
      ? []
      : [{ label: 'Energy', value: `${count(Math.round(session.kcal))} kcal`, key: true }];
  return [
    { label: 'Distance', value: `${shown.value} ${shown.unit}`, key: true },
    { label: 'Time', value: clockText(session.activeSeconds), key: true },
    ...steps,
    ...energy,
    { label: 'Average', value: `${decimal(session.avgKmh, 1)} km/h`, key: false },
    { label: 'Top speed', value: `${decimal(session.maxKmh, 1)} km/h`, key: false },
  ];
}

export function KindBadges({ session }: { readonly session: TreadmillSession }): ReactNode {
  const source = sourceBadge(session);
  return (
    <View className="flex-row flex-wrap gap-2">
      <Badge label={KIND_LABEL[session.kind]} tone="primary" />
      {source === null ? null : <Badge label={source} tone="neutral" />}
    </View>
  );
}

export function FactTiles({ facts }: { readonly facts: readonly Fact[] }): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-3">
      {facts.map((fact) => (
        <View
          key={fact.label}
          accessible
          accessibilityLabel={`${fact.label} ${fact.value}`}
          className={
            fact.key ? 'min-w-36 flex-1 rounded-md bg-surface-2 p-3' : 'min-w-28 flex-1 p-2'
          }
        >
          <View className="flex-row items-center gap-1.5">
            {fact.violet === true ? <View className="size-2 rounded-full bg-viz-violet" /> : null}
            <Text variant="caption" tone="variant">
              {fact.label}
            </Text>
          </View>
          <Text variant={fact.key ? 'title-3' : 'body-strong'} className="tabular">
            {fact.value}
          </Text>
          {fact.note === undefined ? null : (
            <Text variant="caption" tone="faint">
              {fact.note}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

export function extrasOf(detail: SessionDetail): readonly Fact[] {
  const pace =
    detail.paceSecondsPerKm === null
      ? []
      : [{ label: 'Pace', value: `${clockText(detail.paceSecondsPerKm)} /km`, key: false }];
  const cadence =
    detail.cadence === null
      ? []
      : [{ label: 'Cadence', value: `${decimal(detail.cadence)} steps/min`, key: false }];
  const stride =
    detail.strideM === null
      ? []
      : [{ label: 'Stride', value: `${decimal(detail.strideM, 2)} m`, key: false }];
  const met =
    detail.met === null ? [] : [{ label: 'MET', value: decimal(detail.met, 1), key: false }];
  return [...pace, ...cadence, ...stride, ...met];
}

export interface FactGroup {
  readonly title: string;
  readonly facts: readonly Fact[];
}

const ENERGY_NOTE = { belt: 'From the belt', estimate: 'Estimated' } as const;

const HEART_SOURCE = { grips: 'Grips', watch: 'Watch' } as const;

function movementOf(detail: SessionDetail): Fact[] {
  const base = factsOf(detail.session).filter((fact) => fact.label !== 'Energy');
  return [...base, ...extrasOf(detail).filter((fact) => fact.label !== 'MET')];
}

function inclineFacts(session: TreadmillSession, scale: InclineScale): Fact[] {
  if (session.inclineMax === null) {
    return [];
  }
  const climb =
    session.climbM === null
      ? []
      : [
          {
            label: 'Climb',
            value: `${count(Math.round(session.climbM))} m`,
            key: true,
            violet: true,
          },
        ];
  const average =
    session.inclineAvg === null
      ? []
      : [{ label: 'Average incline', value: inclineText(session.inclineAvg, scale), key: false }];
  return [
    ...climb,
    ...average,
    { label: 'Top incline', value: inclineText(session.inclineMax, scale), key: false },
  ];
}

function estimateFacts(session: TreadmillSession): Fact[] {
  if (session.kcalSource !== 'belt' || session.kcal === null || session.kcalEstimate === null) {
    return [];
  }
  return [
    {
      label: 'Estimate',
      value: `${count(Math.round(session.kcalEstimate))} kcal`,
      key: true,
      note: ENERGY_NOTE.estimate,
    },
  ];
}

function netAndMet(detail: SessionDetail): Fact[] {
  const { session } = detail;
  const net =
    session.kcalNet === null
      ? []
      : [{ label: 'Net energy', value: `${count(Math.round(session.kcalNet))} kcal`, key: false }];
  const met =
    detail.met === null ? [] : [{ label: 'MET', value: decimal(detail.met, 1), key: false }];
  return [...net, ...met];
}

function energyFacts(detail: SessionDetail): Fact[] {
  const { session } = detail;
  const both = estimateFacts(session).length > 0;
  const note = session.kcalSource === null ? null : ENERGY_NOTE[session.kcalSource];
  const energy =
    session.kcal === null
      ? []
      : [
          {
            label: both ? 'Belt' : 'Energy',
            value: `${count(Math.round(session.kcal))} kcal`,
            key: true,
            ...(note === null ? {} : { note }),
          },
        ];
  return [...energy, ...estimateFacts(session), ...netAndMet(detail)];
}

export function factGroupsOf(detail: SessionDetail, scale: InclineScale): readonly FactGroup[] {
  const { session } = detail;
  const heart =
    session.heartRateSource === null
      ? []
      : [{ label: 'Source', value: HEART_SOURCE[session.heartRateSource], key: false }];
  return [
    { title: 'Movement', facts: movementOf(detail) },
    { title: 'Incline', facts: inclineFacts(session, scale) },
    { title: 'Energy', facts: energyFacts(detail) },
    { title: 'Heart rate', facts: heart },
  ].filter((group) => group.facts.length > 0);
}

export function FactGroups({ groups }: { readonly groups: readonly FactGroup[] }): ReactNode {
  return (
    <View className="gap-4">
      {groups.map((group) => (
        <View key={group.title} className="gap-2">
          <Text variant="caption" tone="variant">
            {group.title}
          </Text>
          <FactTiles facts={group.facts} />
        </View>
      ))}
    </View>
  );
}
