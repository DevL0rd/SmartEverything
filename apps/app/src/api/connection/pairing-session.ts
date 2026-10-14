import type { ClientRow } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import {
  PairingEnrollment,
  PairingBusyError,
  type EnrollmentDestination,
  type EnrollmentResult,
} from './pairing-enrollment';
import { forgetStoredEnrollment, storeConnection, type StoredKind } from './storage';
import {
  activateNativeServerEnrollment,
  clearNativeServerCredential,
} from '../../../modules/health-connect/src/hub-network';
import { StaleHubRouteError } from './route-policy';

const log = new Logger('app.connection');
export interface PairingSessionContext {
  readonly kind: StoredKind;
  readonly generation: number;
  readonly isCurrent: () => boolean;
  readonly publish: (result: EnrollmentResult) => void;
  readonly handoff: () => Promise<void>;
  readonly owner: symbol;
}
interface PendingPairing {
  readonly enrollment: PairingEnrollment;
  readonly context: PairingSessionContext;
  busy: boolean;
  saved: EnrollmentResult | null;
}
let pending: PendingPairing | null = null;
export async function preparePairingSession(
  destination: EnrollmentDestination,
  context: PairingSessionContext,
): Promise<PairingEnrollment> {
  if (pending !== null) throw new PairingBusyError();
  const enrollment = new PairingEnrollment(destination, context.isCurrent);
  const current: PendingPairing = { enrollment, context, busy: true, saved: null };
  pending = current;
  try {
    await enrollment.verify();
    current.busy = false;
    return enrollment;
  } catch (error) {
    if (pending === current) pending = null;
    throw error;
  }
}
function currentPairing(enrollment: PairingEnrollment): PendingPairing {
  if (pending?.enrollment !== enrollment || pending.busy) throw new PairingBusyError();
  if (!pending.context.isCurrent()) throw new StaleHubRouteError('POST');
  return pending;
}
function requireCurrent(current: PendingPairing): void {
  if (pending !== current || !current.context.isCurrent()) throw new StaleHubRouteError('POST');
}
async function savePairing(current: PendingPairing, result: EnrollmentResult): Promise<ClientRow> {
  requireCurrent(current);
  const operation = current;
  operation.saved = result;
  await storeConnection(current.context.kind, result.connection, current.context.isCurrent);
  requireCurrent(current);
  await current.context.handoff();
  requireCurrent(current);
  await activateNativeServerEnrollment(result.connection.url, result.connection.token, {
    order: current.context.generation,
    isCurrent: current.context.isCurrent,
  });
  requireCurrent(current);
  await current.enrollment.complete();
  requireCurrent(current);
  current.context.publish(result);
  pending = null;
  log.info('connection.paired', { kind: current.context.kind, role: result.client.role });
  return result.client;
}
async function finish(
  current: PendingPairing,
  task: Promise<EnrollmentResult>,
): Promise<ClientRow> {
  const operation = current;
  operation.busy = true;
  try {
    return await savePairing(current, await task);
  } catch (error) {
    if (pending === current && current.context.isCurrent()) {
      if (current.saved !== null) current.enrollment.savingFailed();
      const status = current.enrollment.state.get().status;
      if (status === 'failed' || status === 'cancelled') pending = null;
    }
    throw error;
  } finally {
    operation.busy = false;
  }
}
export function submitPairingSession(
  enrollment: PairingEnrollment,
  code: string,
  name: string,
): Promise<ClientRow> {
  const current = currentPairing(enrollment);
  return finish(current, enrollment.submit(code, name, current.context.kind));
}
export function recoverPairingSession(enrollment: PairingEnrollment): Promise<ClientRow> {
  const current = currentPairing(enrollment);
  return finish(current, enrollment.recover());
}
export async function cancelPairingSession(owner?: symbol): Promise<void> {
  if (!hasPairingSession(owner)) return;
  const current = pending;
  pending = null;
  if (current === null) return;
  try {
    await current.enrollment.cancel();
  } finally {
    if (current.saved !== null) {
      try {
        await clearNativeServerCredential(current.saved.connection.token);
      } finally {
        await forgetStoredEnrollment(current.context.kind, current.saved.connection);
      }
    }
  }
}
export function hasPairingSession(owner?: symbol): boolean {
  return pending !== null && (owner === undefined || pending.context.owner === owner);
}
