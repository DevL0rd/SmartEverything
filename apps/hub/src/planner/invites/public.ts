import type { PlannerRsvpPage } from '@smarteverything/domain';
import type { Store } from '../../store/store';
import type { RsvpAnswer, RsvpReceipt } from '../units/rsvp';

export interface PublicRsvpDeps {
  readonly store: Pick<Store, 'host'>;
  readonly now: () => Date;
}

export class PublicRsvp {
  constructor(private readonly deps: PublicRsvpDeps) {}

  pageOf(token: string): Promise<PlannerRsvpPage> {
    return this.deps.store.host.read('plannerRsvpPage', { token });
  }

  respond(token: string, answer: RsvpAnswer): Promise<RsvpReceipt> {
    return this.deps.store.host.write('plannerRsvpRespond', {
      token,
      answer,
      at: this.deps.now().toISOString(),
    });
  }
}
