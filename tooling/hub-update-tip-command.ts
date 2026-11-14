import { z } from 'zod';
import { configuredHubSource } from './hub-update-offer.ts';
import { probeHubUpdateTip } from './hub-update-source.ts';

const data = z.string().startsWith('/').parse(process.argv[2]);
const tip = await probeHubUpdateTip(configuredHubSource(data));
process.stdout.write(`${JSON.stringify(tip)}\n`);
