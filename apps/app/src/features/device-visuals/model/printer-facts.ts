import type { PrinterFacts, PrinterInk, PrinterPhase } from '../types';
import type { PrinterLive } from './printer-live';

const FULL = 100;

function phaseOf(live: PrinterLive): PrinterPhase {
  if (!live.online) return 'offline';
  if (live.power !== 'awake') return 'asleep';
  return live.state;
}

function inksOf(live: PrinterLive): readonly PrinterInk[] {
  return live.supplies
    .filter((supply) => supply.detail.consumed && supply.detail.kind !== 'waste')
    .map((supply) => ({
      colour: supply.detail.colour,
      share: supply.level === null ? null : supply.level / FULL,
      warn: supply.standing === 'low' || supply.standing === 'out',
    }));
}

function wasteOf(live: PrinterLive): number | null {
  const waste = live.supplies.find((supply) => !supply.detail.consumed);
  return waste?.level === undefined || waste.level === null ? null : waste.level / FULL;
}

function partOf(live: PrinterLive): PrinterFacts['part'] {
  const problem = live.problems.find((entry) => entry.severity === 'error') ?? live.problems[0];
  return live.online && problem !== undefined && problem.part !== 'none' ? problem.part : null;
}

export function printerFactsOf(live: PrinterLive, identify = false): PrinterFacts {
  const tray = live.trays[0];
  const bin = live.bins[0];
  return {
    variant: live.details.variant,
    mfp: live.details.mfp,
    phase: phaseOf(live),
    progress: (live.jobProgress ?? 0) / FULL,
    part: partOf(live),
    inks: inksOf(live),
    waste: wasteOf(live),
    paper: tray?.level === undefined || tray.level === null ? null : tray.level / FULL,
    output: bin?.level === undefined || bin.level === null ? 0 : bin.level / FULL,
    identify,
  };
}
