import type { PlannerAlarmSound, PlannerSleep } from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';

export interface PhonePlayback {
  readonly ringing: boolean;
  readonly nowPlaying: string | null;
  readonly safetyNet: string | null;
}

export interface SoundLine {
  readonly icon: IconName;
  readonly text: string;
  readonly fellBack: boolean;
}

const TONE_NAME = 'the alarm tone';

function minutesText(total: number): string {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${String(minutes)} min`;
  return minutes === 0 ? `${String(hours)} h` : `${String(hours)} h ${String(minutes)} min`;
}

function averageText(asleep: number, average: number): string {
  const difference = asleep - average;
  if (difference === 0) return 'right on your week average';
  const side = difference > 0 ? 'more' : 'less';
  return `${minutesText(Math.abs(difference))} ${side} than your week average`;
}

export function sleepLineOf(sleep: PlannerSleep | undefined, today: string): string | null {
  const night = sleep?.nights.find((entry) => entry.date === today);
  if (sleep === undefined || night === undefined) return null;
  const slept = `Slept ${minutesText(night.asleep_minutes)}`;
  const average = sleep.week_average_minutes;
  return average === null
    ? `${slept}.`
    : `${slept}, ${averageText(night.asleep_minutes, average)}.`;
}

function chosenLineOf(sound: PlannerAlarmSound | null): SoundLine | null {
  if (sound === null || sound.kind === 'tone') return null;
  if (sound.kind === 'radio')
    return { icon: 'radio', text: `Radio · ${sound.name}`, fellBack: false };
  const text =
    sound.kind === 'file'
      ? 'Your song from Drive'
      : `Your playlist from Drive${sound.shuffle ? ', shuffled' : ''}`;
  return { icon: 'music', text, fellBack: false };
}

export function soundLineOf(
  phone: PhonePlayback | null,
  sound: PlannerAlarmSound | null,
): SoundLine | null {
  if (phone?.ringing !== true) return chosenLineOf(sound);
  if (phone.safetyNet !== null) {
    return {
      icon: 'warning',
      text: `Playing ${TONE_NAME} because ${phone.safetyNet}.`,
      fellBack: true,
    };
  }
  if (phone.nowPlaying === null || phone.nowPlaying === TONE_NAME) return null;
  return {
    icon: sound?.kind === 'radio' ? 'radio' : 'music',
    text: `Playing ${phone.nowPlaying}`,
    fellBack: false,
  };
}
