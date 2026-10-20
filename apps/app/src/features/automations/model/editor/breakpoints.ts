import type { AutomationsBreakpointsPref } from '@smarteverything/domain';
import {
  MAX_BREAKPOINT_AUTOMATIONS,
  MAX_BREAKPOINTS_PER_AUTOMATION,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { ValueStore } from '../../../../design/external-store';

const log = new Logger('app.automations');

export interface BreakpointPort {
  readonly load: () => Promise<AutomationsBreakpointsPref>;
  readonly save: (pref: AutomationsBreakpointsPref) => Promise<void>;
}

export interface BreakpointState {
  readonly pref: AutomationsBreakpointsPref;
  readonly loaded: boolean;
  readonly saveFailed: boolean;
}

export const NO_BREAKPOINTS: AutomationsBreakpointsPref = { byAutomation: {} };

export function breakpointsOf(
  pref: AutomationsBreakpointsPref,
  automationId: string,
): readonly string[] {
  return pref.byAutomation[automationId] ?? [];
}

export function hasBreakpoint(
  pref: AutomationsBreakpointsPref,
  automationId: string,
  nodeId: string,
): boolean {
  return breakpointsOf(pref, automationId).includes(nodeId);
}

function withList(
  pref: AutomationsBreakpointsPref,
  automationId: string,
  list: readonly string[],
): AutomationsBreakpointsPref {
  const { [automationId]: _previous, ...others } = pref.byAutomation;
  if (list.length === 0) return { byAutomation: others };
  const entries = Object.entries({ ...others, [automationId]: [...list] });
  const kept = entries.slice(Math.max(0, entries.length - MAX_BREAKPOINT_AUTOMATIONS));
  return { byAutomation: Object.fromEntries(kept) };
}

export function toggleBreakpoint(
  pref: AutomationsBreakpointsPref,
  automationId: string,
  nodeId: string,
): AutomationsBreakpointsPref {
  const current = breakpointsOf(pref, automationId);
  if (current.includes(nodeId)) {
    return withList(
      pref,
      automationId,
      current.filter((id) => id !== nodeId),
    );
  }
  const next = [...current, nodeId].slice(-MAX_BREAKPOINTS_PER_AUTOMATION);
  return withList(pref, automationId, next);
}

export function clearBreakpoints(
  pref: AutomationsBreakpointsPref,
  automationId: string,
): AutomationsBreakpointsPref {
  return automationId in pref.byAutomation ? withList(pref, automationId, []) : pref;
}

export function pruneBreakpoints(
  pref: AutomationsBreakpointsPref,
  automationId: string,
  existing: ReadonlySet<string>,
): AutomationsBreakpointsPref {
  const current = breakpointsOf(pref, automationId);
  const kept = current.filter((id) => existing.has(id));
  if (kept.length === current.length) return pref;
  return withList(pref, automationId, kept);
}

export class BreakpointModel {
  readonly state = new ValueStore<BreakpointState>({
    pref: NO_BREAKPOINTS,
    loaded: false,
    saveFailed: false,
  });

  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly port: BreakpointPort) {}

  readonly load = async (): Promise<void> => {
    const pref = await this.port.load();
    this.state.update((current) => ({ ...current, pref, loaded: true }));
  };

  readonly toggle = (automationId: string, nodeId: string): void => {
    this.change((pref) => toggleBreakpoint(pref, automationId, nodeId));
  };

  readonly clear = (automationId: string): void => {
    this.change((pref) => clearBreakpoints(pref, automationId));
  };

  readonly prune = (automationId: string, existing: ReadonlySet<string>): void => {
    this.change((pref) => pruneBreakpoints(pref, automationId, existing));
  };

  readonly settled = (): Promise<void> => this.queue;

  private change(edit: (pref: AutomationsBreakpointsPref) => AutomationsBreakpointsPref): void {
    const current = this.state.get();
    const pref = edit(current.pref);
    if (pref === current.pref) return;
    this.state.set({ ...current, pref });
    this.queue = this.queue.then(() => this.persist());
  }

  private async persist(): Promise<void> {
    try {
      await this.port.save(this.state.get().pref);
      this.state.update((current) => ({ ...current, saveFailed: false }));
    } catch (error) {
      log.warn('breakpoints.save_failed', { reason: String(error) });
      this.state.update((current) => ({ ...current, saveFailed: true }));
    }
  }
}
