import type { PlannerBedtime, PlannerSleepSound } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import type { ReactNode } from 'react';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import { Card } from '../../../components/card';
import { NavRow, SelectRow, SwitchRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { useRows } from '../../../store/selectors';
import { openSystemSetting, useAlarmPhone } from '../../setup';
import { OFF, leadOf, leadOptionsOf } from './schedule-model';
import { NOISES, NOISE_LABELS, sleepSoundTitleOf } from './sleep-sound-model';

export interface BeforeBedProps {
  readonly bedtime: PlannerBedtime;
  readonly sleepSound: PlannerSleepSound | null;
  readonly sleepSoundName: string | null;
  readonly offline: boolean;
  readonly compact: boolean;
  readonly onSave: (edit: (bedtime: PlannerBedtime) => PlannerBedtime) => void;
}

const NONE = 'none';

const CHOSEN = 'chosen';

function chosenOf(card: BeforeBedProps): PlannerSleepSound | null {
  const own = card.bedtime.sleep_sound;
  if (own !== null && own.kind !== 'noise') return own;
  return card.sleepSound !== null && card.sleepSound.kind !== 'noise' ? card.sleepSound : null;
}

function soundOptions(card: BeforeBedProps): readonly { value: string; label: string }[] {
  const chosen = chosenOf(card);
  return [
    { value: NONE, label: 'No sound' },
    ...NOISES.map((colour) => ({ value: colour, label: NOISE_LABELS[colour] })),
    ...(chosen === null
      ? []
      : [{ value: CHOSEN, label: sleepSoundTitleOf(chosen, card.sleepSoundName) }]),
  ];
}

function soundValueOf(sound: PlannerSleepSound | null): string {
  if (sound === null) return NONE;
  return sound.kind === 'noise' ? sound.colour : CHOSEN;
}

function soundOf(value: string, chosen: PlannerSleepSound | null): PlannerSleepSound | null {
  if (value === NONE) return null;
  if (value === CHOSEN) return chosen;
  const colour = NOISES.find((entry) => entry === value);
  return colour === undefined ? null : { kind: 'noise', colour };
}

function AutomationRow({ card }: { readonly card: BeforeBedProps }): ReactNode {
  const automations = useRows('automations').map((row) => ({ value: row.id, label: row.name }));
  const { bedtime } = card;
  if (automations.length === 0) {
    return (
      <NavRow
        title="Wind-down automation"
        subtitle="Set one up to dim lights or close blinds"
        icon="automations"
        compact={card.compact}
        disabled={card.offline}
        href={href.automationNew()}
      />
    );
  }
  return (
    <SelectRow
      title="Wind-down automation"
      wrapTitle
      icon="automations"
      compact={card.compact}
      searchable
      options={[{ value: NONE, label: 'None' }, ...automations]}
      value={bedtime.wind_down_automation_id ?? NONE}
      disabled={card.offline || bedtime.wind_down_minutes === null}
      onChange={(value) => {
        card.onSave((current) => ({
          ...current,
          wind_down_automation_id: value === NONE ? null : value,
        }));
      }}
    />
  );
}

function QuietAccess(): ReactNode {
  const phone = useAlarmPhone();
  if (phone.quiet !== false) return null;
  return (
    <Banner
      tone="warning"
      title="This phone cannot turn on Do not disturb yet"
      body="Allow Do not disturb access so bedtime can quiet it."
      wrapBody
      action={{
        label: 'Allow access',
        variant: 'tonal',
        onPress: () => {
          background(openSystemSetting('do_not_disturb'), 'setup.system_setting_failed');
        },
      }}
    />
  );
}

function LeadRows({ card }: { readonly card: BeforeBedProps }): ReactNode {
  const { bedtime, compact, offline, onSave } = card;
  return (
    <>
      <SelectRow
        title="Bedtime reminder"
        wrapTitle
        icon="bell"
        compact={compact}
        options={leadOptionsOf(bedtime.reminder_minutes)}
        value={bedtime.reminder_minutes === null ? OFF : String(bedtime.reminder_minutes)}
        disabled={offline}
        onChange={(value) => {
          onSave((current) => ({ ...current, reminder_minutes: leadOf(value) }));
        }}
      />
      <SelectRow
        title="Wind-down"
        wrapTitle
        icon="breath"
        compact={compact}
        options={leadOptionsOf(bedtime.wind_down_minutes)}
        value={bedtime.wind_down_minutes === null ? OFF : String(bedtime.wind_down_minutes)}
        disabled={offline}
        onChange={(value) => {
          onSave((current) => ({ ...current, wind_down_minutes: leadOf(value) }));
        }}
      />
    </>
  );
}

export function BeforeBedCard(card: BeforeBedProps): ReactNode {
  const { bedtime, compact, offline, onSave } = card;
  const off = !bedtime.enabled || bedtime.schedule.length === 0;
  return (
    <Card title="Before bed" icon="breath">
      <QuietAccess />
      <List>
        <LeadRows card={{ ...card, offline: offline || off }} />
        <AutomationRow card={{ ...card, offline: offline || off }} />
        <SwitchRow
          title="Do not disturb"
          subtitle="On at wind-down, off when you wake"
          icon="bellOff"
          compact={compact}
          value={bedtime.do_not_disturb}
          disabled={offline || off}
          onChange={(value) => {
            onSave((current) => ({ ...current, do_not_disturb: value }));
          }}
        />
        <SelectRow
          title="Sleep sound at bedtime"
          wrapTitle
          icon="audioLines"
          compact={compact}
          options={soundOptions(card)}
          value={soundValueOf(bedtime.sleep_sound)}
          disabled={offline || off}
          onChange={(value) => {
            onSave((current) => ({ ...current, sleep_sound: soundOf(value, chosenOf(card)) }));
          }}
        />
      </List>
    </Card>
  );
}
