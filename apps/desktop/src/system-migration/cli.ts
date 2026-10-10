import { argv, exit, stderr, stdout } from 'node:process';
import { inspect } from 'node:util';
import { z } from 'zod';
import { readXdgEnvironment } from '../environment.js';
import { SYSTEMD_UNIT } from '../service/definitions.js';
import { nodeSystem } from '../service/system.js';
import { nodeMigrationHost, type MigrationHost } from './host.js';
import { preflight, type MigrationPlan } from './plan.js';
import { readFacts } from './probe.js';
import { rollBack } from './rollback.js';
import { describe, switchToSystem, unitProperty, type SwitchTiming } from './switch.js';

const READY_TIMEOUT_MS = 120_000;
const FAILED = 1;
const NEEDS_HANDS = 2;

const ARGUMENTS = z.strictObject({
  command: z.enum(['plan', 'apply', 'rollback']),
  tunnel: z.boolean(),
  root: z.string().startsWith('/'),
  settleSeconds: z.coerce.number().int().min(0).max(600),
});

type Arguments = z.infer<typeof ARGUMENTS>;

function valueAfter(list: readonly string[], flag: string): string | undefined {
  const index = list.indexOf(flag);
  return index === -1 ? undefined : list[index + 1];
}

function parseArguments(list: readonly string[]): Arguments {
  return ARGUMENTS.parse({
    command: list[0],
    tunnel: list.includes('--tunnel'),
    root: valueAfter(list, '--root') ?? '/',
    settleSeconds: valueAfter(list, '--settle-seconds') ?? '60',
  });
}

function reason(cause: unknown): string {
  return cause instanceof Error ? cause.message : inspect(cause);
}

const report = (line: string): void => {
  stdout.write(`${line}\n`);
};

function printPlan(plan: MigrationPlan): void {
  report(`Server data stays in ${plan.launch.dataDirectory}.`);
  for (const move of plan.moves) {
    report(`\n${move.files.user} → ${move.files.system} (${move.installed}):\n${move.systemText}`);
  }
}

async function alreadyMoved(host: MigrationHost, plan: MigrationPlan): Promise<boolean> {
  const active = await Promise.all(
    plan.moves.map(
      async (move) =>
        move.installed === 'identical' &&
        (await unitProperty(host, move.name, 'ActiveState')) === 'active',
    ),
  );
  return active.every(Boolean);
}

async function apply(
  host: MigrationHost,
  plan: MigrationPlan,
  timing: SwitchTiming,
): Promise<number> {
  if (await alreadyMoved(host, plan)) {
    report(`Already a system service: ${describe(await readFacts(host.system, plan.locations))}`);
    return 0;
  }
  const before = await readFacts(host.system, plan.locations);
  report(`Before: ${describe(before)}`);
  try {
    await switchToSystem(host, { plan, before, timing }, report);
    report(`Done. The user unit files stay in place for rollback.`);
    return 0;
  } catch (cause) {
    report(`Failed: ${reason(cause)}\nRolling back…`);
    try {
      report(`Rolled back: ${describe(await rollBack(host, plan, timing, report))}`);
      return FAILED;
    } catch (rollbackCause) {
      stderr.write(`ROLLBACK FAILED, fix by hand: ${reason(rollbackCause)}\n`);
      return NEEDS_HANDS;
    }
  }
}

async function run(parsed: Arguments): Promise<number> {
  const host = await nodeMigrationHost({
    system: nodeSystem,
    root: parsed.root,
    xdgConfigHome: readXdgEnvironment().XDG_CONFIG_HOME,
  });
  const tunnelMoved = (await host.system.files.read(host.layout.tunnel.system)) !== null;
  const plan = await preflight(host, {
    tunnel: parsed.tunnel || (parsed.command === 'rollback' && tunnelMoved),
  });
  const timing = { readyTimeoutMs: READY_TIMEOUT_MS, settleMs: parsed.settleSeconds * 1000 };
  if (parsed.command === 'plan') {
    printPlan(plan);
    report(`\nNow: ${describe(await readFacts(host.system, plan.locations))}`);
    report(`${SYSTEMD_UNIT} runs as ${host.layout.account.user} before login once applied.`);
    return 0;
  }
  if (parsed.command === 'rollback') {
    report(`Rolled back: ${describe(await rollBack(host, plan, timing, report))}`);
    return 0;
  }
  return apply(host, plan, timing);
}

run(parseArguments(argv.slice(2))).then(exit, (cause: unknown) => {
  stderr.write(`${reason(cause)}\n`);
  exit(FAILED);
});
