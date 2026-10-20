import { CommandRefusedError, type DeviceCommand } from '@smarteverything/domain';
import { DEFAULT_LOOK, isBlack, lookOfRgb, type Look, type Rgb } from './colour-math';
import {
  controllerIds,
  effectOf,
  unitsOf,
  type LightUnit,
  type UnitSnapshot,
  type UnitState,
} from './controller-device';
import { planLightCommand, type LightPlan, type LightStep } from './light-plan';
import { activeModeOf, takesColour, takesLedColours, takesModeColour } from './modes';
import type { OpenRgbController } from './transport';

export interface LookMemory {
  readonly get: (unitId: string) => Look | null;
  readonly put: (unitId: string, look: Look) => void;
}

export interface PreparedCommand {
  readonly index: number;
  readonly steps: readonly LightStep[];
  readonly commit: () => void;
}

class Entry {
  readonly states = new Map<string, UnitState>();
  readonly leds: Rgb[];
  present = true;

  constructor(
    public info: OpenRgbController,
    readonly index: number,
    readonly units: readonly LightUnit[],
  ) {
    this.leds = info.colors.map((colour) => colour);
  }

  activate(modeName: string): void {
    this.info = {
      ...this.info,
      activeMode: this.info.modes.findIndex((mode) => mode.name === modeName),
    };
  }

  fill(unit: LightUnit, colours: readonly Rgb[]): void {
    this.leds.splice(unit.start, colours.length, ...colours);
  }
}

export class ControllerModel {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly memory: LookMemory) {}

  replace(controllers: readonly OpenRgbController[]): void {
    const ids = controllerIds(controllers);
    for (const entry of this.entries.values()) {
      entry.present = false;
    }
    controllers.forEach((info, index) => {
      const id = ids[index];
      if (id === undefined) {
        throw new Error('OpenRGB listed a controller without an identity.');
      }
      this.load(id, info, index);
    });
  }

  snapshots(online: boolean, at: string): readonly UnitSnapshot[] {
    return [...this.entries.values()].flatMap((entry) =>
      entry.units.map((unit) => this.snapshotOf(entry, unit, online && entry.present, at)),
    );
  }

  prepare(command: DeviceCommand): PreparedCommand {
    const found = this.find(command.externalId);
    if (found?.entry.present !== true) {
      throw new CommandRefusedError(command.capability, 'this OpenRGB light is not available');
    }
    const { entry, unit } = found;
    const state = this.stateOf(entry, unit);
    const plan = planLightCommand(entry.info, unit, state, command);
    return {
      index: entry.index,
      steps: plan.steps,
      commit: (): void => {
        this.apply(entry, unit, plan);
      },
    };
  }

  private load(id: string, info: OpenRgbController, index: number): void {
    const entry = new Entry(info, index, unitsOf(id, info));
    for (const unit of entry.units) {
      entry.states.set(unit.externalId, this.derive(entry, unit));
    }
    this.entries.set(id, entry);
  }

  private find(externalId: string): { entry: Entry; unit: LightUnit } | null {
    for (const entry of this.entries.values()) {
      const unit = entry.units.find((candidate) => candidate.externalId === externalId);
      if (unit !== undefined) {
        return { entry, unit };
      }
    }
    return null;
  }

  private stateOf(entry: Entry, unit: LightUnit): UnitState {
    const state = entry.states.get(unit.externalId);
    if (state === undefined) {
      throw new Error(`OpenRGB light ${unit.externalId} has no known state.`);
    }
    return state;
  }

  private snapshotOf(entry: Entry, unit: LightUnit, online: boolean, at: string): UnitSnapshot {
    return {
      unit,
      info: entry.info,
      state: this.stateOf(entry, unit),
      effect: unit.zone === null ? effectOf(entry.info) : null,
      online,
      at,
    };
  }

  private derive(entry: Entry, unit: LightUnit): UnitState {
    const remembered = this.memory.get(unit.externalId) ?? DEFAULT_LOOK;
    const mode = activeModeOf(entry.info);
    if (mode !== undefined && !takesColour(mode)) {
      return { on: true, look: remembered };
    }
    const source =
      mode !== undefined && takesModeColour(mode) && !takesLedColours(mode)
        ? mode.colors
        : entry.leds.slice(unit.start, unit.start + unit.count);
    const lit = source.find((colour) => !isBlack(colour));
    return lit === undefined ? { on: false, look: remembered } : { on: true, look: lookOfRgb(lit) };
  }

  private apply(entry: Entry, unit: LightUnit, plan: LightPlan): void {
    entry.activate(plan.mode);
    for (const step of plan.steps) {
      if (step.kind === 'leds') {
        entry.fill(unit, step.colours);
      }
    }
    for (const sibling of unit.zone === null ? entry.units : [unit]) {
      entry.states.set(sibling.externalId, plan.state);
    }
    if (unit.zone !== null) {
      this.refreshWhole(entry);
    }
    if (plan.state.on) {
      this.memory.put(unit.externalId, plan.state.look);
    }
  }

  private refreshWhole(entry: Entry): void {
    const whole = entry.units.find((unit) => unit.zone === null);
    if (whole !== undefined) {
      entry.states.set(whole.externalId, this.derive(entry, whole));
    }
  }
}
