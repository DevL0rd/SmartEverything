import type { PlannerAlarmRow, PlannerPreferences } from '@smarteverything/domain';
import { useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import { useAreaWidth } from '../../../design/size-class';
import { useSettings } from '../../../store/selectors';
import { useDriveItem } from '../../drive';
import { usePlannerAlarms, useVisibleMinute, QueryBody } from '../../planner';
import { ClockFrame } from '../frame/clock-frame';
import { useHubOffline } from '../frame/hub-status';
import { shellLayoutOf } from '../../../components/page-shell/layout';
import { BeforeBedCard } from './before-bed-card';
import {
  useBedtimePrefs,
  useBedtimeSaves,
  useSleepSoundControl,
  useSleepSoundLive,
  type BedtimeSaves,
} from './bedtime-data';
import { useClockLabel } from '../format/clock-format';
import { nextNightOf, startedBedtime, tonightLineOf } from './schedule-model';
import { SleepChartCard } from './sleep-chart';
import { driveItemIdOf } from './sleep-sound-model';
import { SleepSoundsCard } from './sleep-sounds-card';
import { TonightCard, type BedtimeLayout } from './tonight-card';
import { WakeAlarmCard } from './wake-alarm-card';

interface BedtimeView {
  readonly prefs: PlannerPreferences;
  readonly alarms: readonly PlannerAlarmRow[];
  readonly now: number;
  readonly zone: string;
  readonly layout: BedtimeLayout;
  readonly offline: boolean;
  readonly saves: BedtimeSaves;
}

function layoutOf(area: number): BedtimeLayout {
  const frame = shellLayoutOf(area);
  if (frame === 'compact') return 'compact';
  return frame === 'icon' ? 'medium' : 'wide';
}

function Tonight({ view }: { readonly view: BedtimeView }): ReactNode {
  return (
    <TonightCard
      bedtime={view.prefs.bedtime}
      weekStart={view.prefs.general.week_start}
      now={view.now}
      zone={view.zone}
      layout={view.layout}
      offline={view.offline}
      onSave={view.saves.bedtime}
      onStart={() => {
        view.saves.bedtime((bedtime) => startedBedtime(bedtime, view.alarms));
      }}
    />
  );
}

function useSoundName(view: BedtimeView): string | null {
  return useDriveItem(driveItemIdOf(view.prefs.sleep_sounds.sound), null).data?.name ?? null;
}

function SideCards({ view }: { readonly view: BedtimeView }): ReactNode {
  const compact = view.layout === 'compact';
  const soundName = useSoundName(view);
  const live = useSleepSoundLive();
  const control = useSleepSoundControl();
  return (
    <>
      <BeforeBedCard
        bedtime={view.prefs.bedtime}
        sleepSound={view.prefs.sleep_sounds.sound}
        sleepSoundName={soundName}
        offline={view.offline}
        compact={compact}
        onSave={view.saves.bedtime}
      />
      <SleepSoundsCard
        sounds={view.prefs.sleep_sounds}
        itemName={soundName}
        live={live}
        control={control}
        compact={compact}
        offline={view.offline}
        onSave={view.saves.sleepSounds}
      />
    </>
  );
}

function WakeCard({ view }: { readonly view: BedtimeView }): ReactNode {
  const { bedtime } = view.prefs;
  if (!bedtime.enabled || bedtime.schedule.length === 0) return null;
  return (
    <WakeAlarmCard
      schedule={bedtime.schedule}
      alarms={view.alarms}
      weekStart={view.prefs.general.week_start}
      now={view.now}
      zone={view.zone}
      offline={view.offline}
    />
  );
}

function BedtimeBody({ view }: { readonly view: BedtimeView }): ReactNode {
  const chart = <SleepChartCard bedtime={view.prefs.bedtime} now={view.now} zone={view.zone} />;
  if (view.layout !== 'wide') {
    return (
      <View className="gap-section-gap">
        <Tonight view={view} />
        <WakeCard view={view} />
        <SideCards view={view} />
        {chart}
      </View>
    );
  }
  return (
    <View className="flex-row items-start gap-6">
      <View className="min-w-0 flex-1 gap-section-gap">
        <Tonight view={view} />
        {chart}
      </View>
      <View className="w-100 gap-section-gap">
        <WakeCard view={view} />
        <SideCards view={view} />
      </View>
    </View>
  );
}

interface SubtitleInputs {
  readonly now: number;
  readonly zone: string;
  readonly clockLabel: (time: string) => string;
}

function subtitleOf(prefs: PlannerPreferences | undefined, inputs: SubtitleInputs): string {
  if (prefs === undefined) return 'Bed, wind-down and sleep sounds';
  if (!prefs.bedtime.enabled) return 'Off';
  if (prefs.bedtime.schedule.length === 0) return 'No nights planned';
  const { now, zone, clockLabel } = inputs;
  return tonightLineOf(nextNightOf(prefs.bedtime, now, zone), now, clockLabel);
}

export function BedtimePage(): ReactNode {
  const ref = useRef<View>(null);
  const { value: now, onLayout } = useVisibleMinute(ref);
  const prefs = useBedtimePrefs();
  const alarms = usePlannerAlarms(null);
  const zone = useSettings().time_zone;
  const layout = layoutOf(useAreaWidth());
  const offline = useHubOffline();
  const saves = useBedtimeSaves();
  return (
    <ClockFrame
      section="bedtime"
      subtitle={subtitleOf(prefs.data, { now, zone, clockLabel: useClockLabel() })}
    >
      <View ref={ref} onLayout={onLayout}>
        <QueryBody query={prefs}>
          {(loaded) => (
            <BedtimeBody view={{ prefs: loaded, alarms, now, zone, layout, offline, saves }} />
          )}
        </QueryBody>
      </View>
    </ClockFrame>
  );
}
