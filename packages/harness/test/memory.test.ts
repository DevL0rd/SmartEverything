import { afterEach, describe, expect, it } from 'vitest';
import type { Context } from '@deepseek-ai/cordis';
import type {
  AiMemoryAccess,
  AiMemoryLine,
  AiMemoryRecall,
  AiMemoryToolLine,
  AiMemoryToolArguments,
  AiMemoryToolResult,
} from '@smarteverything/domain';
import { bindMemory } from '../src/plugins/memory';
import { renderRecall } from '../src/plugins/memory/recall';
import { bootRuntime, spoken, turnsFinished } from './support/runtime';
import type { RuntimeFixture } from './support/runtime';

const FIRST = '7b7a1c1e-3a0f-4c63-9a1b-0a8f8c0c0001';
const SECOND = '7b7a1c1e-3a0f-4c63-9a1b-0a8f8c0c0002';
const HOME = '7b7a1c1e-3a0f-4c63-9a1b-0a8f8c0c0003';
const VOCAB = '7b7a1c1e-3a0f-4c63-9a1b-0a8f8c0c0004';
const CORE = '7b7a1c1e-3a0f-4c63-9a1b-0a8f8c0c0005';
const EPISODE = '7b7a1c1e-3a0f-4c63-9a1b-0a8f8c0c0006';
const TRIP = '7b7a1c1e-3a0f-4c63-9a1b-0a8f8c0c0007';
const MOMENT = '2026-10-25T10:00:00.000Z';
const NOW = new Date('2026-10-25T12:00:00.000Z');

function line(id: string, scope: AiMemoryLine['scope'], text: string): AiMemoryLine {
  return {
    id,
    scope,
    text,
    kind: 'fact',
    importance: 3,
    happened_on: null,
    valid_until: null,
    updated_at: MOMENT,
  };
}

function toolLine(): AiMemoryToolLine {
  const { updated_at, ...rest } = line(FIRST, 'person', 'kept');
  return { ...rest, saved: `saved ${updated_at}` };
}

function recallOf(
  recent: readonly AiMemoryLine[],
  extra: Partial<AiMemoryRecall> = {},
): AiMemoryRecall {
  return {
    time_zone: 'UTC',
    prompt_chars: null,
    core: [],
    vocabulary: [],
    relevant: [],
    recent: [...recent],
    today: [],
    week: [],
    month: [],
    year: [],
    faded: 0,
    ...extra,
  };
}

class FakeMemory implements AiMemoryAccess {
  readonly calls: { readonly sessionId: string; readonly args: AiMemoryToolArguments }[] = [];
  readonly recalls = new Map<string, AiMemoryRecall>();
  readonly hidden = new Set<string>();
  readonly prepared: string[] = [];

  prepare(sessionId: string): Promise<void> {
    this.prepared.push(sessionId);
    return Promise.resolve();
  }

  offered(sessionId: string): boolean {
    return !this.hidden.has(sessionId);
  }

  recall(sessionId: string): AiMemoryRecall {
    return this.recalls.get(sessionId) ?? recallOf([]);
  }

  call(sessionId: string, args: AiMemoryToolArguments): Promise<AiMemoryToolResult> {
    this.calls.push({ sessionId, args });
    return Promise.resolve(
      args.action === 'delete' ? { deleted: args.id } : { memory: toolLine(), outcome: 'added' },
    );
  }
}

let fixture: RuntimeFixture | undefined;
afterEach(async () => {
  await fixture?.dispose();
  fixture = undefined;
});

async function boot(): Promise<{ readonly host: RuntimeFixture; readonly ctx: Context }> {
  let captured: Context | undefined;
  fixture = await bootRuntime({
    mount: (ctx) => {
      captured = ctx;
    },
  });
  if (captured === undefined) throw new Error('The runtime never mounted the test route.');
  return { host: fixture, ctx: captured };
}

async function asked(host: RuntimeFixture, turns: number, sessionId?: string): Promise<string> {
  const options = host.sessionOptions(sessionId);
  const session = await host.runtime.create(options);
  session.text('hello');
  await turnsFinished(host, session, turns);
  return options.sessionId;
}

function offered(host: RuntimeFixture, request: number): readonly string[] {
  return host.model.requests[request]?.tools?.map((tool) => tool.name) ?? [];
}

function everythingSaid(host: RuntimeFixture, request: number): string {
  return spoken(host.model.requests[request]?.messages ?? [])
    .map((entry) => entry.text)
    .join('\n');
}

describe('the memory plugin without a hub behind it', () => {
  it('offers no memory tool and shows no notes', async () => {
    const { host } = await boot();
    host.model.script({ kind: 'text', text: 'hi' });

    await asked(host, 1);

    expect(offered(host, 0)).not.toContain('memory');
    expect(everythingSaid(host, 0)).not.toContain('memory tool');
  });
});

describe('the memory plugin bound to a hub', () => {
  it('offers the one memory tool and shows each session only the notes its hub answer holds', async () => {
    const { host, ctx } = await boot();
    const memory = new FakeMemory();
    const first = host.sessionOptions().sessionId;
    const second = host.sessionOptions().sessionId;
    memory.recalls.set(
      first,
      recallOf([
        line(FIRST, 'person', 'The first person likes tea {{without_variable}}'),
        line(HOME, 'home', 'The house key is under the mat'),
      ]),
    );
    memory.recalls.set(
      second,
      recallOf([line(SECOND, 'person', 'The second person likes coffee')]),
    );
    bindMemory(ctx, memory);
    host.model.script({ kind: 'text', text: 'one' }, { kind: 'text', text: 'two' });

    await asked(host, 1, first);
    await asked(host, 2, second);
    expect(memory.prepared).toStrictEqual([first, second]);

    expect(offered(host, 0).filter((name) => name === 'memory')).toStrictEqual(['memory']);
    const seenByFirst = everythingSaid(host, 0);
    expect(seenByFirst).toContain('likes tea {{without_variable}}');
    expect(seenByFirst).toContain('under the mat');
    expect(seenByFirst).not.toContain('likes coffee');
    const seenBySecond = everythingSaid(host, 1);
    expect(seenBySecond).toContain('likes coffee');
    expect(seenBySecond).not.toContain('likes tea');
    expect(seenBySecond).not.toContain('under the mat');
  });

  it('hides the tool and the notes of a session whose person turned memory off', async () => {
    const { host, ctx } = await boot();
    const memory = new FakeMemory();
    const session = host.sessionOptions().sessionId;
    memory.hidden.add(session);
    memory.recalls.set(session, recallOf([line(FIRST, 'person', 'A secret preference')]));
    bindMemory(ctx, memory);
    host.model.script({ kind: 'text', text: 'hi' });

    await asked(host, 1, session);

    expect(offered(host, 0)).not.toContain('memory');
  });

  it('runs a call for the session that made it and never takes a person from the model', async () => {
    const { host, ctx } = await boot();
    const memory = new FakeMemory();
    bindMemory(ctx, memory);
    host.model.script(
      {
        kind: 'tool',
        id: 'c1',
        name: 'memory',
        input: { action: 'add', scope: 'person', text: 'Likes tea' },
      },
      {
        kind: 'tool',
        id: 'c2',
        name: 'memory',
        input: { action: 'view', profile_id: SECOND },
      },
      { kind: 'text', text: 'done' },
    );

    const session = await asked(host, 1);

    expect(memory.calls).toStrictEqual([
      { sessionId: session, args: { action: 'add', scope: 'person', text: 'Likes tea' } },
    ]);
    expect(everythingSaid(host, 2)).toContain('profile_id');
  });

  it('runs an add whose unused fields the model sent as empty strings', async () => {
    const { host, ctx } = await boot();
    const memory = new FakeMemory();
    bindMemory(ctx, memory);
    host.model.script(
      {
        kind: 'tool',
        id: 'c1',
        name: 'memory',
        input: { action: 'add', scope: 'person', text: 'Likes tea', id: '', query: '' },
      },
      {
        kind: 'tool',
        id: 'c2',
        name: 'memory',
        input: { action: 'delete', id: FIRST, scope: 'home', text: 'unused' },
      },
      { kind: 'tool', id: 'c3', name: 'memory', input: { action: 'edit', id: '', text: 'x' } },
      { kind: 'text', text: 'done' },
    );

    const session = await asked(host, 1);

    expect(memory.calls).toStrictEqual([
      { sessionId: session, args: { action: 'add', scope: 'person', text: 'Likes tea' } },
      { sessionId: session, args: { action: 'delete', id: FIRST } },
    ]);
    expect(everythingSaid(host, 3)).toContain('id');
  });

  it('tells the model plainly that an add without the note needs text', async () => {
    const { host, ctx } = await boot();
    const memory = new FakeMemory();
    bindMemory(ctx, memory);
    host.model.script(
      {
        kind: 'tool',
        id: 'c1',
        name: 'memory',
        input: { action: 'add', scope: 'person', kind: 'fact', importance: 95, query: 'tea' },
      },
      { kind: 'text', text: 'done' },
    );

    await asked(host, 1);

    expect(memory.calls).toStrictEqual([]);
    expect(everythingSaid(host, 1)).toContain(
      'add needs text: the note itself, one self-contained fact, as a string',
    );
  });

  it('stops offering the tool once the hub lets go', async () => {
    const { host, ctx } = await boot();
    const release = bindMemory(ctx, new FakeMemory());
    release();
    host.model.script({ kind: 'text', text: 'hi' });

    await asked(host, 1);

    expect(offered(host, 0)).not.toContain('memory');
  });
});

describe('the notes shown at the start of a chat', () => {
  const newest = line(FIRST, 'person', 'newest');
  const older = line(SECOND, 'person', 'older\nsecond line');
  const word: AiMemoryLine = {
    ...line(VOCAB, 'person', '"girl juice" means estrogen HRT. Example: time for my girl juice'),
    kind: 'vocabulary',
  };
  const core: AiMemoryLine = { ...line(CORE, 'person', 'Dan is vegetarian'), importance: 95 };
  const episode: AiMemoryLine = {
    ...line(EPISODE, 'person', 'Dan and the AI beat the Water Temple'),
    kind: 'episode',
    happened_on: '2026-03-02',
  };

  it('writes short text-only lines with every line of a note indented', () => {
    const text = renderRecall(recallOf([newest, older]), NOW);

    expect(text).toContain(
      'Recent:\n- newest (saved 2026-10-25 10:00, 2 hr ago)\n- older\n  second line (saved 2026-10-25 10:00, 2 hr ago)',
    );
    expect(text).not.toContain(FIRST);
    expect(text).not.toContain('[fact');
  });

  it('writes the saved time in the home time zone with the relative time', () => {
    const text = renderRecall({ ...recallOf([newest]), time_zone: 'Asia/Bangkok' }, NOW);

    expect(text).toContain('- newest (saved 2026-10-25 17:00, 2 hr ago)');
  });

  it('writes happened, until and saved together on one short line', () => {
    const dated = { ...episode, valid_until: '2026-12-01' };
    const text = renderRecall(recallOf([dated]), NOW);

    expect(text).toContain(
      `- ${episode.text} (happened 2026-03-02, until 2026-12-01, saved 2026-10-25 10:00, 2 hr ago)`,
    );
  });

  it('writes vocabulary under Their words before the other sections', () => {
    const text = renderRecall(recallOf([newest], { vocabulary: [word] }), NOW);

    expect(text).toContain('Their words:\n- "girl juice" means estrogen HRT');
    expect(text.indexOf('Their words:')).toBeLessThan(text.indexOf('Recent:'));
  });

  it('renders the sections in the stable order with plain headings', () => {
    const text = renderRecall(
      recallOf([newest], {
        core: [core],
        vocabulary: [word],
        relevant: [episode],
        today: [line(HOME, 'home', 'today note')],
        week: [line(TRIP, 'home', 'week note')],
        month: [line(SECOND, 'person', 'month note')],
        year: [line(FIRST, 'person', 'year note')],
      }),
      NOW,
    );
    const order = [
      'Their words:',
      'Relevant to what they just said:',
      'Recent:',
      'Most significant today:',
      'Most significant this week:',
      'Most significant this month:',
      'Most significant this year:',
      'Always worth knowing:',
    ].map((heading) => text.indexOf(heading));

    expect(order.every((index) => index >= 0)).toBe(true);
    expect(order).toStrictEqual(order.toSorted((a, b) => a - b));
    expect(renderRecall(recallOf([newest], { core: [core] }), NOW)).toBe(
      renderRecall(recallOf([newest], { core: [core] }), NOW),
    );
  });

  it('fills core first, then vocabulary, relevant and recent, and counts what is left out', () => {
    const suffixed = [
      `- ${core.text} (saved 2026-10-25 10:00, 2 hr ago)`,
      `- ${word.text} (saved 2026-10-25 10:00, 2 hr ago)`,
      `- ${episode.text} (happened 2026-03-02, saved 2026-10-25 10:00, 2 hr ago)`,
    ];
    const budget = suffixed.reduce((used, entry) => used + entry.length + 1, 0);

    const text = renderRecall(
      recallOf([newest], {
        core: [core],
        vocabulary: [word],
        relevant: [episode],
        faded: 3,
        prompt_chars: budget,
      }),
      NOW,
    );

    expect(text).toContain('Dan is vegetarian');
    expect(text).toContain('girl juice');
    expect(text).toContain('Water Temple');
    expect(text).not.toContain('newest');
    expect(text).toContain(
      '4 more notes have faded from this list but are kept; find them with memory view and a query.',
    );
  });

  it('ends with the plain rule that the notes are background and a greeting gets a greeting', () => {
    const text = renderRecall(recallOf([newest]), NOW);

    expect(text.endsWith('a greeting gets a greeting.')).toBe(true);
    expect(text).toContain('never recite them or bring them up unprompted');
  });

  it('shows nothing when there are no notes and a footer when only faded ones remain', () => {
    expect(renderRecall(recallOf([], { prompt_chars: 5 }), NOW)).toBe('');
    expect(renderRecall(recallOf([], { faded: 2 }), NOW)).toContain('2 more notes have faded');
  });
});
