import type { Posted } from './payloads';

interface Anchor {
  readonly message: Posted;
  readonly base: string;
  readonly steps: string[];
}

const SHOWN_STEPS = 6;
const LIMIT = 2000;

function statusSection(steps: readonly string[]): string {
  const recent = steps.slice(-SHOWN_STEPS);
  const done = recent.slice(0, -1).map((step) => `> -# ✓ ${step}`);
  return ['> ⏳ **Working on it**', ...done, `> **›** ${recent.at(-1) ?? ''}`].join('\n');
}

function withSection(base: string, steps: readonly string[]): string {
  const section = statusSection(
    steps.map((step) => step.replace(/\s+/g, ' ').trim()).filter((step) => step !== ''),
  );
  const text = base === '' ? section : `${base}\n\n${section}`;
  return text.length > LIMIT ? `${text.slice(0, LIMIT - 1)}…` : text;
}

export class StatusBoard {
  private readonly anchors = new Map<string, Anchor>();
  private readonly chains = new Map<string, Promise<unknown>>();

  constructor(
    private readonly edit: (message: Posted, content: string) => Promise<unknown>,
    private readonly remove: (message: Posted) => Promise<unknown>,
    private readonly report: (cause: unknown) => void,
  ) {}

  show(eventId: string, step: string, post: (content: string) => Promise<Posted>): Promise<Posted> {
    return this.serial(eventId, async () => {
      const anchor = this.anchors.get(eventId);
      if (anchor !== undefined) {
        if (anchor.steps.at(-1) === step) {
          return anchor.message;
        }
        anchor.steps.push(step);
        const edited = await this.edit(anchor.message, withSection(anchor.base, anchor.steps)).then(
          () => true,
          () => false,
        );
        if (edited) {
          return anchor.message;
        }
      }
      const steps = [step];
      const message = await post(withSection('', steps));
      this.anchors.set(eventId, { message, base: '', steps });
      return message;
    });
  }

  settle(
    eventId: string,
    reply?: { readonly message: Posted; readonly content: string },
  ): Promise<void> {
    return this.serial(eventId, async () => {
      const anchor = this.anchors.get(eventId);
      if (anchor !== undefined && anchor.steps.length > 0) {
        await (
          anchor.base === '' ? this.remove(anchor.message) : this.edit(anchor.message, anchor.base)
        ).catch((cause: unknown) => {
          this.report(cause);
        });
      }
      if (reply !== undefined && reply.content.length <= LIMIT) {
        this.anchors.set(eventId, { message: reply.message, base: reply.content, steps: [] });
      } else {
        this.anchors.delete(eventId);
      }
    });
  }

  private serial<T>(eventId: string, work: () => Promise<T>): Promise<T> {
    const next = (this.chains.get(eventId) ?? Promise.resolve()).catch(() => undefined).then(work);
    this.chains.set(eventId, next);
    next
      .finally(() => {
        if (this.chains.get(eventId) === next) {
          this.chains.delete(eventId);
        }
      })
      .catch(() => undefined);
    return next;
  }
}
