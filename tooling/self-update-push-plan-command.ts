import { isAbsolute } from 'node:path';
import { z } from 'zod';
import { PLAN_REQUEST } from '../apps/hub/src/self-update/plan-contract.ts';
import { requireAnyHubSource } from './hub-build-gate.ts';
import { dataLayoutOf } from './release-hub-files.ts';
import { configuredHubSource } from './hub-update-offer.ts';
import { planPush } from './self-update-push-plan.ts';

const PLAN_DATA = z.string().refine(isAbsolute, { message: 'must be an absolute path' });

const data = PLAN_DATA.parse(process.argv[2]);
requireAnyHubSource(dataLayoutOf(data), ['hub', 'app', 'ui', 'desktop']);
const request = PLAN_REQUEST.parse(JSON.parse(z.string().parse(process.argv[3])));
const result = await planPush(await configuredHubSource(data), request);
process.stdout.write(`${JSON.stringify(result)}\n`);
