import { configuredHubSource } from './hub-update-offer.ts';
import { probeHubUpdateTip } from './hub-update-source.ts';

const tip = await probeHubUpdateTip(configuredHubSource(process.cwd()));
process.stdout.write(`${JSON.stringify(tip)}\n`);
