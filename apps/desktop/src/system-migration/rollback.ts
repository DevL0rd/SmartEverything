import type { MigrationHost } from './host.js';
import type { MigrationPlan } from './plan.js';
import { readFacts, waitForNewServer, type HubFacts } from './probe.js';
import type { Report, SwitchTiming } from './switch.js';

export async function rollBack(
  host: MigrationHost,
  plan: MigrationPlan,
  timing: SwitchTiming,
  report: Report,
): Promise<HubFacts> {
  for (const move of [...plan.moves].reverse()) {
    if ((await host.system.files.read(move.files.system)) !== null) {
      await host.elevated(['disable', '--now', move.name]);
      await host.removeUnit(move.files.system);
    }
  }
  await host.elevated(['daemon-reload']);
  report('Removed the system service.');
  for (const move of plan.moves) {
    await host.userctl(['enable', '--now', move.name]);
  }
  await waitForNewServer(host.system, plan.locations, null, timing.readyTimeoutMs);
  const facts = await readFacts(host.system, plan.locations);
  report('The user service is running again.');
  return facts;
}
