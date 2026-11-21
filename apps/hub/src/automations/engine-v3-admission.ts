import type { AutomationV3, JsonValue } from '@smarteverything/domain';
import { pureEvaluators } from '@smarteverything/flow/nodes/pure/index';
import { homeRoot, readPort } from './engine-v3-context';
import type { EngineV3Ports } from './engine-v3-types';
import { admissionCheck, leadingReads } from './triggers-v3/admit';
import type { Checked } from '@smarteverything/flow/interpret/frames';
import type { AdmissionParts } from './triggers-v3/admit';
import type { TriggerFire } from './triggers-v3/payload';
import { ReadSuspended } from '@smarteverything/flow/interpret/read-pending';
import { background } from '@smarteverything/logging';
import { StepReads } from './world-v3/step-reads';

export interface AdmissionSubject {
  readonly id: string;
  readonly program: AutomationV3;
}

type AdmissionPorts = Pick<EngineV3Ports, 'world' | 'clock' | 'zone' | 'kinds'>;

export async function withFetched<T>(
  ports: AdmissionPorts,
  evaluate: (fetching: StepReads) => T,
): Promise<T> {
  const fetching = new StepReads(ports.world.host, ports.clock);
  for (;;) {
    try {
      const value = evaluate(fetching);
      fetching.completed();
      return value;
    } catch (cause) {
      if (!(cause instanceof ReadSuspended)) throw cause;
      await fetching.suspended();
    }
  }
}

function readsOf(
  ports: AdmissionPorts,
  subject: AdmissionSubject,
  fire: TriggerFire,
  fetching: StepReads,
): NonNullable<AdmissionParts['reads']> {
  const { world, clock, zone, kinds } = ports;
  return {
    nodes: leadingReads(subject.program.body.nodes, kinds),
    kinds,
    port: readPort(
      { reads: world.reads, persistent: world.persistent, kinds },
      subject.id,
      fetching,
    ),
    pure: pureEvaluators(
      {
        timeZone: zone(),
        now: () => clock.now().getTime(),
        trigger: () => fire.key,
      },
      kinds,
    ),
  };
}

function rootsOf(ports: Pick<EngineV3Ports, 'zone'>): Readonly<Record<string, JsonValue>> {
  return { home: homeRoot(ports.zone) };
}

export function admissionParts(
  ports: AdmissionPorts,
  subject: AdmissionSubject,
  fire: TriggerFire,
  fetching: StepReads,
): AdmissionParts {
  const { program } = subject;
  const reads = program.admit === undefined ? undefined : readsOf(ports, subject, fire, fetching);
  return { admit: program.admit, reads, roots: rootsOf(ports) };
}

export function conditionParts(
  ports: AdmissionPorts,
  subject: AdmissionSubject,
  fire: TriggerFire,
  fetching: StepReads,
): AdmissionParts {
  return { reads: readsOf(ports, subject, fire, fetching), roots: rootsOf(ports) };
}

export function admissionVerdict(
  ports: AdmissionPorts,
  subject: AdmissionSubject,
  fire: TriggerFire,
): Promise<Checked<boolean>> {
  return withFetched(ports, (fetching) =>
    admissionCheck(admissionParts(ports, subject, fire, fetching), fire)(),
  );
}

export const UNMANUAL = { manual: false, startedBy: null, parentRunId: null } as const;

export async function admissionOf(
  ports: AdmissionPorts,
  subject: AdmissionSubject | undefined,
  fire: TriggerFire,
): Promise<Checked<boolean> | undefined> {
  return subject === undefined ? undefined : admissionVerdict(ports, subject, fire);
}

export class Fires {
  private readonly pending = new Set<Promise<unknown>>();

  track(automationId: string, firing: Promise<unknown>): void {
    const tracked = firing.finally(() => this.pending.delete(tracked));
    this.pending.add(tracked);
    background(tracked, 'automation.fire_failed', { automationId });
  }

  async settled(): Promise<void> {
    await Promise.all([...this.pending]);
  }
}
