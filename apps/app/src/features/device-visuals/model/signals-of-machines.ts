import { MAX_BELT_KMH, type BottleOrientation } from '@smarteverything/domain';
import type { VisualState } from '../types';
import { isLowBattery } from '../visuals/vacuum/look';
import { batteryEntry, clamp01, fraction, share, type SignalEntry } from './signals-of-units';

type VacuumFacts = NonNullable<VisualState['vacuum']>;
type TreadmillFacts = NonNullable<VisualState['treadmill']>;
type PrinterFacts = NonNullable<VisualState['printer']>;
type BottleFacts = NonNullable<VisualState['bottle']>;
type ToothbrushFacts = NonNullable<VisualState['toothbrush']>;
type RobotFacts = NonNullable<VisualState['robot']>;

const DEGREES = 180 / Math.PI;

const BOTTLE_TILT_DEGREES: Readonly<Record<BottleOrientation, number>> = {
  upright: 0,
  tilted: 24,
  side: 82,
  upside_down: 180,
};

function inclineDegrees(gradePercent: number): number {
  return Math.atan(Math.max(0, gradePercent) / 100) * DEGREES;
}

function vacuumFault(facts: VacuumFacts): boolean {
  return facts.online && (facts.lifted || facts.phase === 'error');
}

function cleanModeOf(facts: VacuumFacts): string | undefined {
  return facts.phase === 'mopping' ? 'mop' : undefined;
}

function vacuumFacts(facts: VacuumFacts): readonly SignalEntry[] {
  return [
    ['phase', facts.phase ?? undefined],
    ['cleanMode', cleanModeOf(facts)],
    ['lidarRaised', facts.online && facts.lidarUp],
    ['lifted', facts.online && facts.lifted],
    ['batteryLow', isLowBattery(facts)],
    ['mode', facts.station ?? undefined],
    ['progress', fraction(facts.stationProgress)],
    ['charging', facts.phase === 'charging'],
    ['fault', vacuumFault(facts)],
    ['battery', fraction(facts.battery)],
    ['waterLevel', fraction(facts.cleanTank)],
    ['fill', fraction(facts.dirtyTank)],
  ];
}

export function vacuumEntries(state: VisualState): readonly SignalEntry[] {
  return state.vacuum === undefined ? [] : vacuumFacts(state.vacuum);
}

function robotFacts(facts: RobotFacts): readonly SignalEntry[] {
  return [['phase', facts.mood]];
}

export function robotEntries(state: VisualState): readonly SignalEntry[] {
  return state.robot === undefined ? [] : robotFacts(state.robot);
}

function treadmillFacts(facts: TreadmillFacts): readonly SignalEntry[] {
  return [
    ['phase', facts.belt],
    ['speed', clamp01(facts.speedKmh / MAX_BELT_KMH)],
    ['incline', inclineDegrees(facts.inclineGrade)],
    ['fault', facts.fault !== null || facts.belt === 'fault'],
    ['locked', facts.childLock],
    ['mode', facts.zone],
  ];
}

export function treadmillEntries(state: VisualState): readonly SignalEntry[] {
  return state.treadmill === undefined ? [] : treadmillFacts(state.treadmill);
}

function lowestInk(facts: PrinterFacts): number | undefined {
  const known = facts.inks.flatMap((ink) => (ink.share === null ? [] : [ink.share]));
  return known.length === 0 ? undefined : clamp01(Math.min(...known));
}

function printerFacts(facts: PrinterFacts): readonly SignalEntry[] {
  return [
    ['phase', facts.phase],
    ['progress', clamp01(facts.progress)],
    ['inkLevels', lowestInk(facts)],
    ['alarm', facts.inks.some((ink) => ink.warn)],
    ['fault', facts.phase === 'stopped'],
  ];
}

export function printerEntries(state: VisualState): readonly SignalEntry[] {
  return state.printer === undefined ? [] : printerFacts(state.printer);
}

function bottleFacts(facts: BottleFacts): readonly SignalEntry[] {
  return [
    ['phase', facts.light],
    ['fill', fraction(facts.fill)],
    ['uv', facts.light === 'uv'],
    ['mode', facts.uvMode ?? undefined],
    ['tilt', BOTTLE_TILT_DEGREES[facts.tilt]],
    ['battery', share(facts.battery)],
    ['charging', facts.light === 'charging'],
    ['fault', facts.light === 'fault'],
    ['locked', facts.light === 'locked'],
  ];
}

export function bottleEntries(state: VisualState): readonly SignalEntry[] {
  return state.bottle === undefined ? [] : bottleFacts(state.bottle);
}

function toothbrushFacts(facts: ToothbrushFacts): readonly SignalEntry[] {
  return [
    ['phase', facts.activity],
    ['mode', facts.mode ?? undefined],
    ['battery', share(facts.battery)],
    ['charging', facts.activity === 'charging'],
    ['fault', facts.fault],
    ['alarm', facts.pressure === 'too_high'],
  ];
}

export function toothbrushEntries(state: VisualState): readonly SignalEntry[] {
  return state.toothbrush === undefined ? [] : toothbrushFacts(state.toothbrush);
}

export function fileSyncEntries(state: VisualState): readonly SignalEntry[] {
  return [['phase', state.syncing ? 'syncing' : 'idle'], batteryEntry(state)];
}
