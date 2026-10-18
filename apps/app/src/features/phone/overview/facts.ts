import { bytes } from '../../../format/number';
import { hoursMinutes } from '../../../format/time';
import { joinParts } from '../../../format/text';
import type { PhoneReadings } from '../phone-values';

export interface HeroFacts {
  readonly line: string;
  readonly place: string | null;
}

const SIGNAL_WORDS = ['No signal', 'Weak', 'Fair', 'Good', 'Great'] as const;

function signalOf(readings: PhoneReadings): string | null {
  if (readings.network === null) return null;
  const word = readings.signalBars === null ? undefined : SIGNAL_WORDS[readings.signalBars];
  return word === undefined ? readings.network : `${readings.network} · ${word}`;
}

export function heroFactsOf(readings: PhoneReadings): HeroFacts {
  return {
    line: joinParts([
      readings.temperature === null ? null : `${String(Math.round(readings.temperature))} °C`,
      signalOf(readings),
      readings.storageFree === null ? null : `${bytes(readings.storageFree)} free`,
      readings.screenMinutes === null ? null : `${hoursMinutes(readings.screenMinutes)} on screen`,
    ]),
    place: readings.place,
  };
}
