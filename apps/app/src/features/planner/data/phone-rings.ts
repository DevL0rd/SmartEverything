import { API_ENDPOINTS as E, type PlannerPhoneRingSet } from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import { useEffect } from 'react';
import { installPhoneRings, plannerLinked } from '../../../../modules/health-connect';
import { api } from '../../../api/transport';
import { errorFields } from '../../../design/log-tally';
import { noticeHandler, type NoticeHandler } from '../../../store/notice-registry';
import { useSession, useSyncStatus } from '../../../store/selectors';

const log = new Logger('app.planner');

export interface PhoneRingsLink {
  readonly linked: () => boolean;
  readonly read: (clientId: string) => Promise<PlannerPhoneRingSet>;
  readonly install: (set: PlannerPhoneRingSet, clientId: string) => Promise<void>;
}

export const nativePhoneRings: PhoneRingsLink = {
  linked: plannerLinked,
  read: (clientId) => api().call(E.readPlannerPhoneRings, { query: { clientId } }),
  install: installPhoneRings,
};

export async function syncPhoneRings(link: PhoneRingsLink, clientId: string): Promise<boolean> {
  if (!link.linked()) return false;
  const set = await link.read(clientId);
  await link.install(set, clientId);
  log.info('planner.phone_rings_synced', { rings: set.rings.length });
  return true;
}

export class PhoneRingsSync {
  private running = false;
  private again = false;

  constructor(
    private readonly link: PhoneRingsLink,
    private readonly clientId: () => string | null,
  ) {}

  async request(): Promise<void> {
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = true;
    try {
      let pending = true;
      while (pending) {
        this.again = false;
        await this.once();
        pending = this.requestedAgain();
      }
    } finally {
      this.running = false;
    }
  }

  private requestedAgain(): boolean {
    return this.again;
  }

  private async once(): Promise<void> {
    const clientId = this.clientId();
    if (clientId === null) return;
    try {
      await syncPhoneRings(this.link, clientId);
    } catch (error) {
      log.warn('planner.phone_rings_failed', errorFields(error));
    }
  }
}

let ownClientId: string | null = null;

const shared = new PhoneRingsSync(nativePhoneRings, () => ownClientId);

function requestPhoneRings(clientId: string | null): void {
  ownClientId = clientId;
  background(shared.request(), 'planner.phone_rings_failed');
}

export const PHONE_RINGS_NOTICE: NoticeHandler = noticeHandler(
  ['planner_phone_rings'],
  (_message, { store }) => {
    requestPhoneRings(store.get().session?.client.id ?? null);
  },
);

export function usePhoneRingsSync(): void {
  const clientId = useSession().client.id;
  const live = useSyncStatus().status === 'live';
  useEffect(() => {
    if (live) requestPhoneRings(clientId);
  }, [live, clientId]);
}
