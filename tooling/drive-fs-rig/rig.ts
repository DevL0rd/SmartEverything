import { argv, exit, stdout } from 'node:process';
import { exec, folder, kill, mount, net, route, status, unmount } from './commands.ts';
import { down } from './lifecycle.ts';
import { manifest, printWalk } from './manifest-command.ts';
import { SCRATCH } from './paths.ts';
import { lock, requireRigLock, unlock } from './rig-lock.ts';
import { crash } from './suites/crash.ts';
import { posix } from './suites/posix.ts';
import { routeSwitch } from './suites/route-switch.ts';
import { two } from './suites/two.ts';
import { workloads } from './suites/workloads.ts';
import { up } from './up.ts';

const USAGE = `rig <command>

  up [--service <built service folder>]   build the Hub service, start the test Hub and netcut, pair computers A and B
  lock <owner id>                         take tmp/locks/drive-rig.lock; every other command then needs SE_RIG_LOCK_OWNER=<owner id>
  unlock <owner id>                       release the lock
  down                                    stop everything and delete ${SCRATCH}
  status                                  show the rig state as JSON
  mount <A|B> [--placement test|scratch|<root id>] [--folder <id or name>] [--route lan|public|none]
  unmount <A|B>
  route <A|B> <lan|public|none>           send the helper its route control line
  net <A|B|all> <cut|cutreply|stall|reset|restore> [lan|public]
  net status
  kill <A|B> [--signal KILL|TERM|...]     signal the helper (default KILL)
  exec <A|B> -- <command...>              run a command inside the namespace of that computer's helper
  posix <pjd|fsx|xfstests> [--only <test>]... [--computer A|B]   run a POSIX suite on the whole-drive mount of that computer (default A, B uses the scratch drive) and write its result under tmp/drive-mount-fs/results
  workloads [--case <name>]... [--repeat N] [--list]
  two [--case <name>]... [--repeat N] [--list]
  crash [--case <substring>]... [--repeat 3] [--list]      crash and dropped-connection suite
  route-switch [--case <substring>]... [--repeat 3] [--list]
  folder <test|scratch> <name>            create a folder at the top of that drive and print its item id (a mount of a folder is what the helper can write into today)
  manifest write <name> <folder> [--in <A|B>]
  manifest check <name> [--placement test|scratch] [--prefix <relative folder>] [--modes]
`;

type Handler = (args: readonly string[]) => Promise<number>;

function succeeding(run: (args: readonly string[]) => Promise<void>): Handler {
  return async (args) => {
    await run(args);
    return 0;
  };
}

const HANDLERS = new Map<string, Handler>([
  ['up', succeeding(up)],
  ['lock', succeeding(lock)],
  ['unlock', succeeding(unlock)],
  ['down', succeeding(down)],
  ['status', succeeding(status)],
  ['mount', succeeding(mount)],
  ['unmount', succeeding(unmount)],
  ['route', succeeding(route)],
  ['net', succeeding(net)],
  ['kill', succeeding(kill)],
  ['exec', exec],
  ['folder', succeeding(folder)],
  ['manifest', manifest],
  ['posix', posix],
  ['workloads', workloads],
  ['two', two],
  ['crash', crash],
  ['route-switch', routeSwitch],
  ['walk', succeeding((args) => printWalk(args[0]))],
]);

async function main(): Promise<number> {
  const [command, ...rest] = argv.slice(2);
  const handler = command === undefined ? undefined : HANDLERS.get(command);
  if (handler === undefined) {
    stdout.write(USAGE);
    return command === undefined ? 0 : 2;
  }
  await requireRigLock(command ?? '', rest);
  return handler(rest);
}

try {
  exit(await main());
} catch (cause) {
  process.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`);
  exit(1);
}
