import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon, type IconName } from '../../components/icon';
import { IconButton } from '../../components/icon-button';
import { Text } from '../../components/text';
import { cn } from '../../design/cn';
import type { ColourRole } from '../../design/tokens';
import { decimal, kilocalories, kilometres } from '../../format/number';
import { dayAge, daysBetween, hoursMinutes, relative } from '../../format/time';
import type { WatchGlance } from './watch-glance';
import { syncNow } from './watch-link';
import { PHASE_TEXT } from './watch-phone-rows';

export type FactKey = 'heart' | 'sleep' | 'battery' | 'sync' | 'distance' | 'energy';

export interface Fact {
  readonly key: FactKey;
  readonly icon: IconName;
  readonly label: string;
  readonly value: string;
  readonly caption: string | null;
  readonly stale: boolean;
  readonly warn: boolean;
}

const ROLE: Readonly<Record<FactKey, ColourRole>> = {
  heart: 'heart',
  sleep: 'sleep-core',
  battery: 'positive',
  sync: 'primary',
  distance: 'viz-2',
  energy: 'move',
};

const WELL: Readonly<Record<FactKey, string>> = {
  heart: 'bg-heart/16',
  sleep: 'bg-sleep-core/16',
  battery: 'bg-positive/16',
  sync: 'bg-primary/16',
  distance: 'bg-viz-2/16',
  energy: 'bg-move/16',
};

function heartFact(glance: WatchGlance): Fact | null {
  if (glance.heartRate !== null) {
    return fact({
      key: 'heart',
      icon: 'heartPulse',
      label: 'Heart rate',
      value: `${decimal(glance.heartRate)} bpm`,
      caption: 'Live now',
    });
  }
  const resting = glance.resting;
  if (resting === null) {
    return null;
  }
  const age = daysBetween(resting.day, glance.today);
  return {
    ...fact({
      key: 'heart',
      icon: 'heartPulse',
      label: 'Resting HR',
      value: `${decimal(resting.value)} bpm`,
      caption: dayAge(resting.day, glance.today),
    }),
    stale: age > 1,
  };
}

function sleepFact(glance: WatchGlance): Fact | null {
  const sleep = glance.sleep;
  if (sleep === null) {
    return null;
  }
  const age = daysBetween(sleep.day, glance.today);
  return {
    ...fact({
      key: 'sleep',
      icon: 'moon',
      label: 'Sleep',
      value: hoursMinutes(sleep.value),
      caption: age <= 0 ? 'Last night' : dayAge(sleep.day, glance.today),
    }),
    stale: age > 0,
  };
}

function wristText(glance: WatchGlance): string | null {
  if (glance.charging) {
    return 'Charging';
  }
  if (glance.worn === null) {
    return null;
  }
  return glance.worn ? 'On your wrist' : 'Off your wrist';
}

function batteryFact(glance: WatchGlance): Fact | null {
  if (glance.battery === null) {
    return null;
  }
  return {
    ...fact({
      key: 'battery',
      icon: 'battery',
      label: 'Battery',
      value: `${String(glance.battery)}%`,
      caption: wristText(glance),
    }),
    warn: glance.battery < 20 && !glance.charging,
  };
}

function syncFact(glance: WatchGlance, now: number): Fact {
  const connected = glance.phase === 'connected';
  const value = glance.syncing
    ? 'Syncing…'
    : glance.syncedAt === null
      ? 'Not yet'
      : relative(glance.syncedAt, now);
  const caption = glance.phase === null ? null : connected ? 'Connected' : PHASE_TEXT[glance.phase];
  return {
    ...fact({ key: 'sync', icon: 'refresh', label: 'Last sync', value, caption }),
    warn: !connected,
  };
}

type FactBase = Pick<Fact, 'key' | 'icon' | 'label' | 'value' | 'caption'>;

function fact(base: FactBase): Fact {
  return { ...base, stale: false, warn: false };
}

export function factsOf(glance: WatchGlance, now: number, extra = false): readonly Fact[] {
  const today: readonly (Fact | null)[] = extra
    ? [
        glance.distance === null
          ? null
          : fact({
              key: 'distance',
              icon: 'route',
              label: 'Distance',
              value: kilometres(glance.distance),
              caption: 'At last sync',
            }),
        glance.energy === null
          ? null
          : fact({
              key: 'energy',
              icon: 'flame',
              label: 'Active energy',
              value: kilocalories(glance.energy),
              caption: 'Today',
            }),
      ]
    : [];
  return [
    heartFact(glance),
    sleepFact(glance),
    batteryFact(glance),
    syncFact(glance, now),
    ...today,
  ].filter((item): item is Fact => item !== null);
}

export function FactTile({ fact: item }: { readonly fact: Fact }): ReactNode {
  return (
    <View className="min-w-0 flex-1 flex-row items-center gap-3 rounded-md bg-surface-2 p-3">
      <View className={cn('size-9 items-center justify-center rounded-full', WELL[item.key])}>
        <Icon name={item.icon} size={20} colour={ROLE[item.key]} />
      </View>
      <View className="min-w-0 flex-1">
        <Text variant="footnote" tone="variant" numberOfLines={1}>
          {item.label}
        </Text>
        <Text
          variant="body-strong"
          tone={item.stale ? 'faint' : 'default'}
          className="tabular"
          numberOfLines={1}
        >
          {item.value}
        </Text>
        {item.caption === null ? null : (
          <Text variant="caption" tone={item.warn ? 'warning' : 'faint'} numberOfLines={1}>
            {item.caption}
          </Text>
        )}
      </View>
    </View>
  );
}

export function FactChip({ fact: item }: { readonly fact: Fact }): ReactNode {
  return (
    <View className="flex-row items-center gap-1.5">
      <Icon name={item.icon} size={16} colour={ROLE[item.key]} />
      <Text
        variant="footnote"
        tone={item.stale ? 'faint' : 'variant'}
        className="tabular"
        numberOfLines={1}
      >
        {item.stale && item.caption !== null ? `${item.value} · ${item.caption}` : item.value}
      </Text>
    </View>
  );
}

export function canSync(glance: WatchGlance): boolean {
  return glance.onThisPhone && glance.phase === 'connected' && !glance.syncing;
}

export function SyncButton({ glance }: { readonly glance: WatchGlance }): ReactNode {
  if (!glance.onThisPhone) {
    return null;
  }
  return (
    <IconButton
      icon="refresh"
      label={glance.syncing ? 'Syncing' : 'Sync now'}
      disabled={!canSync(glance)}
      onPress={() => {
        void syncNow();
      }}
    />
  );
}
