import { PrinterError } from '@smarteverything/domain';
import type { PrinterSession } from './session';

export class PrinterRegistry {
  readonly #sessions = new Map<string, PrinterSession>();

  list(): readonly PrinterSession[] {
    return [...this.#sessions.values()];
  }

  get(uuid: string): PrinterSession | null {
    return this.#sessions.get(uuid) ?? null;
  }

  add(session: PrinterSession): void {
    this.#sessions.set(session.record.uuid, session);
  }

  remove(uuid: string): void {
    this.#sessions.delete(uuid);
  }

  resolve(ref: string | undefined): PrinterSession {
    const all = this.list();
    if (ref === undefined) {
      const [only, ...others] = all;
      if (only !== undefined && others.length === 0) return only;
      throw new PrinterError(
        'not_a_printer',
        all.length === 0 ? 'No printer is set up yet.' : `Name the printer: ${this.names()}.`,
      );
    }
    const wanted = ref.trim().toLowerCase();
    const exact = all.filter(
      (session) =>
        session.externalId.toLowerCase() === wanted ||
        session.record.uuid === wanted ||
        session.name.toLowerCase() === wanted,
    );
    const partial = all.filter((session) => session.name.toLowerCase().includes(wanted));
    const found = exact.length > 0 ? exact : partial;
    const [session, ...rest] = found;
    if (session !== undefined && rest.length === 0) return session;
    throw new PrinterError(
      'not_a_printer',
      `${found.length === 0 ? 'No printer matches' : 'Several printers match'} "${ref}". Known printers: ${this.names()}.`,
    );
  }

  names(): string {
    return this.list()
      .map((session) => session.name)
      .join(', ');
  }
}
