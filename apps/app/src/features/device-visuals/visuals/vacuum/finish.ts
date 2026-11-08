import type { VacuumFinish } from './look';

interface PinFinish {
  readonly body: readonly [string, string, string];
  readonly edge: string;
  readonly bumper: string;
  readonly station: string;
}

export const FINISHES: Readonly<Record<VacuumFinish, PinFinish>> = {
  graphite: {
    body: ['#9a9da6', '#62656d', '#363840'],
    edge: '#b9bcc4',
    bumper: '#0e0f12',
    station: '#757881',
  },
  white: {
    body: ['#ffffff', '#efeee9', '#c9c7c0'],
    edge: '#77746d',
    bumper: '#1b1d25',
    station: '#fdfcf9',
  },
  black: {
    body: ['#5c5f6a', '#2b2c32', '#121316'],
    edge: '#9497a3',
    bumper: '#060708',
    station: '#3a3b43',
  },
};
