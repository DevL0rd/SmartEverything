import type { RouterSnapshot } from '@smarteverything/domain';
import type { PluginContext } from '../contract';
import { ClientRegistry } from './client-registry';
import { peopleControls, type PeopleControls } from './people-controls';
import { PeopleRegistry } from './people-registry';
import { routerSearchEntries, searchSignature } from './router-search';

type PresenceContext = Pick<
  PluginContext<unknown>,
  'records' | 'events' | 'home' | 'log' | 'search'
>;

export class RouterPresence {
  readonly #clients: ClientRegistry;
  readonly #people: PeopleRegistry;
  #indexed: string | null = null;

  constructor(private readonly ctx: PresenceContext) {
    this.#clients = new ClientRegistry(ctx.records('clients'), ctx.events.emit, ctx.log);
    this.#people = new PeopleRegistry(ctx.records('people'), ctx.events.emit, ctx.home, ctx.log);
  }

  enrich(snapshot: RouterSnapshot): RouterSnapshot {
    const now = new Date();
    const clients = this.#clients.observe(snapshot.clients, now);
    return { ...snapshot, clients, people: [...this.#people.evaluate(this.#clients.known(), now)] };
  }

  index(enriched: RouterSnapshot): void {
    const signature = searchSignature(enriched);
    if (signature !== this.#indexed) {
      this.#indexed = signature;
      this.ctx.search.replace(routerSearchEntries(enriched));
    }
  }

  controls(current: () => RouterSnapshot, refresh: () => void): PeopleControls {
    return peopleControls({
      people: this.#people,
      current: () => current().people,
      known: () => this.#clients.known(),
      assign: (mac, link) => this.#clients.assign(mac, link),
      refresh,
    });
  }
}
