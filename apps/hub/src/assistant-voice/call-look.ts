import { randomUUID } from 'node:crypto';
import {
  APP_SIGHT_SOURCE,
  HUB_SIGHT_SOURCES,
  SIGHT_CAPTURE_TIMEOUT_MS,
  SIGHT_LOOK_PICTURE_MAX,
  SIGHT_REQUEST_TIMEOUT_MS,
  SIGHT_SOURCES,
  type AppSightSource,
  type AssistantVoiceServerMessage,
  type SightLookTrigger,
  type SightRefusal,
  type SightSource,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import type { HubToolResult } from '../ai-tools/hub-tool';
import type { Picture } from './gemini';
import { SightError } from './sight-error';
import type { ToolAnswer } from './tool-answer';

const REFUSAL_TEXT: Readonly<Record<SightRefusal, string>> = {
  denied: 'They have not allowed that on their device.',
  busy: 'It is in use by another app on their device right now.',
  failed: 'Their device could not take a picture.',
  unsupported: 'Their device cannot do that.',
  declined: 'They said no.',
};

export const SOURCE_TEXT: Readonly<Record<SightSource, string>> = {
  home_camera: 'a camera of the home',
  phone_camera: 'their phone camera',
  phone_screen: 'their phone screen',
  desktop_screen: 'their computer screen',
  desktop_window: 'a window on their computer',
};

const HUB_SOURCES: ReadonlySet<SightSource> = new Set(HUB_SIGHT_SOURCES);

const SEE_ARGUMENTS = z.object({
  source: z.enum(SIGHT_SOURCES).optional(),
  camera: z.string().trim().min(1).optional(),
  facing: z.enum(['front', 'back']).optional(),
  screen: z.string().trim().min(1).optional(),
  window: z.string().trim().min(1).optional(),
  why: z.string().trim().max(300).default(''),
  asked: z.boolean().default(false),
});

type AskedArguments = z.infer<typeof SEE_ARGUMENTS>;

type SeeArguments = Omit<AskedArguments, 'source'> & { readonly source: SightSource };

export interface LookContext {
  readonly look: ReadonlySet<SightSource>;
  readonly available: ReadonlySet<SightSource>;
}

export interface OwnScreen {
  readonly source: SightSource | null;
  readonly computerId: string | null;
}

export interface LookPorts {
  readonly callId: string;
  readonly send: (message: AssistantVoiceServerMessage) => void;
  readonly note: (text: string, picture?: Picture, respond?: boolean) => void;
  readonly delegate: (args: Readonly<Record<string, unknown>>) => Promise<HubToolResult>;
  readonly context: () => LookContext;
  readonly own: () => OwnScreen;
  readonly shared: (source: SightSource) => boolean;
  readonly looked: (source: SightSource, label: string) => void;
  readonly now: () => Date;
  readonly log: Logger;
}

export interface Seen {
  readonly lookId: string;
  readonly source: SightSource;
  readonly label: string;
  readonly picture: Picture;
}

interface PendingCapture {
  readonly resolve: (seen: Seen) => void;
  readonly reject: (error: SightError) => void;
}

type Waiting<T> = (value: T) => void;

function failed(message: string): ToolAnswer {
  return { response: { error: message }, line: '', pictures: [] };
}

function delegatedArguments(
  args: SeeArguments,
  computerId: string | null,
): Readonly<Record<string, unknown>> {
  const computer = computerId === null ? {} : { computer: computerId };
  switch (args.source) {
    case 'home_camera':
      return { source: args.source, camera: args.camera };
    case 'desktop_window':
      return { source: args.source, window: args.window, ...computer };
    case 'desktop_screen':
      return { source: args.source, ...computer };
    case 'phone_camera':
    case 'phone_screen':
      return { source: args.source };
  }
}

function targetOf(args: SeeArguments): string | null {
  return args.window ?? args.screen ?? args.camera ?? args.facing ?? null;
}

export class Looks {
  private readonly captures = new Map<string, PendingCapture>();
  private readonly consents = new Map<string, Waiting<boolean>>();

  constructor(private readonly ports: LookPorts) {}

  async see(args: Readonly<Record<string, unknown>>): Promise<ToolAnswer> {
    const look = this.resolved(args);
    if (typeof look === 'string') {
      return failed(look);
    }
    const { source, why, asked } = look;
    const target = targetOf(look);
    if (!this.reachable(source)) {
      return failed(`Their app cannot show you ${SOURCE_TEXT[source]} on this device.`);
    }
    if (!asked && !this.ports.context().look.has(source) && !this.ports.shared(source)) {
      const accepted = await this.consent(source, why, target);
      if (!accepted) {
        return failed(`They did not let you look at ${SOURCE_TEXT[source]} this time.`);
      }
    }
    try {
      const seen = await this.take(look, target);
      this.shown(seen, asked ? 'asked' : 'ai');
      return {
        response: { status: 'ok', source, what: seen.label, at: this.ports.now().toISOString() },
        line: `Looked at ${seen.label}`,
        pictures: [seen.picture],
      };
    } catch (cause) {
      if (cause instanceof SightError) {
        return failed(cause.message);
      }
      throw cause;
    }
  }

  private resolved(args: Readonly<Record<string, unknown>>): SeeArguments | string {
    const parsed = SEE_ARGUMENTS.safeParse(args);
    if (!parsed.success) {
      return `see needs why and asked: ${parsed.error.message}`;
    }
    const source = parsed.data.source ?? this.ports.own().source;
    return source === null
      ? 'see needs a source: this call has no screen of its own.'
      : { ...parsed.data, source };
  }

  answered(requestId: string, accepted: boolean): void {
    this.consents.get(requestId)?.(accepted);
  }

  arrived(lookId: string, seen: Seen): boolean {
    const pending = this.captures.get(lookId);
    this.captures.delete(lookId);
    pending?.resolve(seen);
    return pending !== undefined;
  }

  refused(requestId: string, refusal: SightRefusal, detail: string | null): void {
    const pending = this.captures.get(requestId);
    this.captures.delete(requestId);
    pending?.reject(new SightError(refusal, detail ?? REFUSAL_TEXT[refusal]));
  }

  shown(seen: Seen, trigger: SightLookTrigger): void {
    const { lookId, source, label, picture } = seen;
    this.ports.looked(source, label);
    const base64 = picture.data.toString('base64');
    this.ports.send({
      type: 'sight_looked',
      callId: this.ports.callId,
      lookId,
      source,
      label,
      at: this.ports.now().toISOString(),
      trigger,
      picture: base64.length <= SIGHT_LOOK_PICTURE_MAX ? base64 : null,
    });
  }

  showPerson(seen: Seen): void {
    this.ports.note(
      `[They showed you ${seen.label} just now: look at this picture when you answer.]`,
      seen.picture,
      false,
    );
    this.shown(seen, 'person');
  }

  end(): void {
    for (const pending of this.captures.values()) {
      pending.reject(new SightError('failed', 'The call ended.'));
    }
    this.captures.clear();
    for (const waiting of this.consents.values()) {
      waiting(false);
    }
    this.consents.clear();
  }

  private consent(source: SightSource, why: string, target: string | null): Promise<boolean> {
    return new Promise((resolve) => {
      const requestId = randomUUID();
      const timer = setTimeout(() => {
        this.consents.delete(requestId);
        resolve(false);
      }, SIGHT_REQUEST_TIMEOUT_MS);
      timer.unref();
      this.consents.set(requestId, (accepted) => {
        clearTimeout(timer);
        this.consents.delete(requestId);
        resolve(accepted);
      });
      this.ports.send({
        type: 'sight_request',
        callId: this.ports.callId,
        requestId,
        what: source,
        why,
        target,
      });
    });
  }

  private reachable(source: SightSource): boolean {
    return this.ports.context().available.has(source) || HUB_SOURCES.has(source);
  }

  private take(args: SeeArguments, target: string | null): Promise<Seen> {
    const app = APP_SIGHT_SOURCE.safeParse(args.source);
    if (app.success && this.ports.context().available.has(app.data)) {
      return this.capture(app.data, target);
    }
    return this.fetched(args);
  }

  private capture(source: AppSightSource, target: string | null): Promise<Seen> {
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.captures.delete(requestId);
        reject(new SightError('failed', 'Nothing came back from their device in time.'));
      }, SIGHT_CAPTURE_TIMEOUT_MS);
      timer.unref();
      this.captures.set(requestId, {
        resolve: (seen) => {
          clearTimeout(timer);
          resolve(seen);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.ports.send({
        type: 'sight_capture',
        callId: this.ports.callId,
        requestId,
        source,
        target,
      });
    });
  }

  private async fetched(args: SeeArguments): Promise<Seen> {
    const result = await this.ports.delegate(delegatedArguments(args, this.ports.own().computerId));
    const picture = result.pictures[0];
    const error = result.response['error'];
    if (picture === undefined) {
      throw new SightError('failed', typeof error === 'string' ? error : 'Nothing could be seen.');
    }
    const what = result.response['what'];
    return {
      lookId: randomUUID(),
      source: args.source,
      label: typeof what === 'string' ? what : SOURCE_TEXT[args.source],
      picture,
    };
  }
}
