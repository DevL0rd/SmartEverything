import type { AutomationV3, JsonValue } from '@smarteverything/domain';
import { pureEvaluators } from '@smarteverything/flow/nodes/pure/index';
import { homeRoot, readPort } from './engine-v3-context';
import type { EngineV3Ports } from './engine-v3-types';
import { leadingReads } from './triggers-v3/admit';
import type { AdmissionParts } from './triggers-v3/admit';
import type { TriggerFire } from './triggers-v3/payload';

export interface AdmissionSubject {
  readonly id: string;
  readonly program: AutomationV3;
}

function readsOf(
  ports: Pick<EngineV3Ports, 'world' | 'clock' | 'zone'>,
  subject: AdmissionSubject,
  fire: TriggerFire,
): NonNullable<AdmissionParts['reads']> {
  const { world, clock, zone } = ports;
  return {
    nodes: leadingReads(subject.program.body.nodes),
    port: readPort({ reads: world.reads, persistent: world.persistent }, subject.id),
    pure: pureEvaluators({
      timeZone: zone(),
      now: () => clock.now().getTime(),
      trigger: () => fire.key,
    }),
  };
}

function rootsOf(ports: Pick<EngineV3Ports, 'zone'>): Readonly<Record<string, JsonValue>> {
  return { home: homeRoot(ports.zone) };
}

export function admissionParts(
  ports: Pick<EngineV3Ports, 'world' | 'clock' | 'zone'>,
  subject: AdmissionSubject,
  fire: TriggerFire,
): AdmissionParts {
  const { program } = subject;
  const reads = program.admit === undefined ? undefined : readsOf(ports, subject, fire);
  return { admit: program.admit, reads, roots: rootsOf(ports) };
}

export function conditionParts(
  ports: Pick<EngineV3Ports, 'world' | 'clock' | 'zone'>,
  subject: AdmissionSubject,
  fire: TriggerFire,
): AdmissionParts {
  return { reads: readsOf(ports, subject, fire), roots: rootsOf(ports) };
}
