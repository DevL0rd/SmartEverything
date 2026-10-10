import { open, stat } from 'node:fs/promises';
import { z } from 'zod';
import { watchFile } from './file-watch';
import { toolActivity } from './tool-activity';

export interface ActivityHooks {
  readonly step: (eventId: string, step: string) => void;
  readonly pickedUp: (eventId: string) => void;
  readonly replied: (eventId: string) => void;
}

const BLOCK = z.looseObject({ type: z.string().optional() });

const ENTRY = z.looseObject({
  type: z.string().optional(),
  message: z.looseObject({ content: z.unknown().optional() }).optional(),
});

type Entry = z.infer<typeof ENTRY>;
type Block = z.infer<typeof BLOCK>;

const QUIET = /assistant_reply|assistant_post|ToolSearch|TodoWrite/i;
const QUOTED = /assistant_reply with eventId "([^"]+)"/g;
const REMINDER = /<system-reminder>[\s\S]*?<\/system-reminder>/g;
const SEEN_KEPT = 100;

function parse(line: string): Entry | undefined {
  try {
    const parsed = ENTRY.safeParse(JSON.parse(line));
    return parsed.success ? parsed.data : undefined;
  } catch (cause) {
    if (!(cause instanceof SyntaxError)) {
      throw cause;
    }
    return undefined;
  }
}

function blocks(entry: Entry): Block[] {
  const content = entry.message?.content;
  if (!Array.isArray(content)) {
    return [];
  }
  return content.flatMap((block: unknown) => {
    const parsed = BLOCK.safeParse(block);
    return parsed.success ? [parsed.data] : [];
  });
}

function toolUses(entry: Entry): { name: string; input: unknown }[] {
  if (entry.type !== 'assistant') {
    return [];
  }
  return blocks(entry).flatMap((block) => {
    const name = block['name'];
    return block.type === 'tool_use' && typeof name === 'string'
      ? [{ name, input: block['input'] }]
      : [];
  });
}

function steps(entry: Entry): string[] {
  return toolUses(entry)
    .filter((use) => !QUIET.test(use.name))
    .map((use) => toolActivity(use.name, use.input));
}

function replies(entry: Entry): string[] {
  return toolUses(entry).flatMap((use) => {
    const input = z
      .looseObject({ eventId: z.string().optional(), progress: z.boolean().optional() })
      .safeParse(use.input);
    const final =
      use.name.endsWith('assistant_reply') && input.success && input.data.progress !== true;
    return final && input.data.eventId !== undefined ? [input.data.eventId] : [];
  });
}

function userText(entry: Entry): string {
  if (entry.type !== 'user') {
    return '';
  }
  const content = entry.message?.content;
  if (typeof content === 'string') {
    return content;
  }
  return blocks(entry)
    .map((block) => {
      const text = block['text'];
      return block.type === 'text' && typeof text === 'string' ? text : '';
    })
    .join('\n');
}

function startsTurn(entry: Entry): boolean {
  if (entry.type !== 'user' || blocks(entry).some((block) => block.type === 'tool_result')) {
    return false;
  }
  return userText(entry).replace(REMINDER, '').trim().length > 0;
}

export class SessionActivity {
  private path: string | null = null;
  private offset = 0;
  private partial = '';
  private current: string | null = null;
  private expected = new Set<string>();
  private seen: string[] = [];
  private readonly waiters = new Map<string, (seen: boolean) => void>();
  private reading: Promise<void> = Promise.resolve();
  private unwatch: (() => void) | null = null;

  constructor(
    private readonly hooks: ActivityHooks,
    private readonly enabled: () => boolean,
  ) {}

  async follow(path: string, eventId: string): Promise<void> {
    if (this.path !== path) {
      this.stop();
      this.offset = (await stat(path)).size;
      this.path = path;
      this.unwatch = watchFile(path, () => {
        this.reading = this.reading.then(() => this.read(path)).catch(() => undefined);
      });
    }
    this.expected.add(eventId);
  }

  pickedUp(eventId: string, waitMs: number): Promise<boolean> {
    if (this.seen.includes(eventId)) {
      return Promise.resolve(true);
    }
    if (!this.expected.has(eventId)) {
      return Promise.resolve(false);
    }
    return new Promise((done) => {
      const finish = (seen: boolean): void => {
        clearTimeout(timer);
        this.waiters.delete(eventId);
        done(seen);
      };
      const timer = setTimeout(() => {
        finish(false);
      }, waitMs);
      this.waiters.set(eventId, finish);
    });
  }

  stop(): void {
    this.unwatch?.();
    this.unwatch = null;
    this.path = null;
    this.partial = '';
    this.current = null;
    this.expected = new Set();
    [...this.waiters.values()].forEach((finish) => {
      finish(false);
    });
  }

  private async read(path: string): Promise<void> {
    if (path !== this.path) {
      return;
    }
    const size = (await stat(path)).size;
    if (size <= this.offset) {
      return;
    }
    const handle = await open(path, 'r');
    try {
      const buffer = Buffer.alloc(size - this.offset);
      await handle.read(buffer, 0, buffer.length, this.offset);
      this.offset = size;
      const lines = (this.partial + buffer.toString('utf8')).split('\n');
      this.partial = lines.pop() ?? '';
      lines.map(parse).forEach((entry) => {
        if (entry !== undefined) {
          this.handle(entry);
        }
      });
    } finally {
      await handle.close();
    }
  }

  private handle(entry: Entry): void {
    const delivered = [...userText(entry).matchAll(QUOTED)]
      .map((match) => match[1] ?? '')
      .filter((id) => this.expected.has(id));
    const eventId = delivered.at(-1);
    if (eventId !== undefined) {
      this.deliveredEntry(eventId);
    } else if (startsTurn(entry)) {
      this.current = null;
    }
    const answered = replies(entry);
    answered.forEach((id) => {
      this.hooks.replied(id);
    });
    this.publish(steps(entry));
    if (this.current !== null && answered.includes(this.current)) {
      this.current = null;
    }
  }

  private deliveredEntry(eventId: string): void {
    this.current = eventId;
    this.expected.delete(eventId);
    this.seen = [...this.seen, eventId].slice(-SEEN_KEPT);
    this.waiters.get(eventId)?.(true);
    this.hooks.pickedUp(eventId);
  }

  private publish(lines: readonly string[]): void {
    const current = this.current;
    if (current === null || !this.enabled()) {
      return;
    }
    lines.forEach((line) => {
      this.hooks.step(current, line);
    });
  }
}
