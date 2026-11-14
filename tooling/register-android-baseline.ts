import { API_ENDPOINTS as E, type AndroidAppObservation } from '@smarteverything/domain';
import { resolve } from 'node:path';
import { env } from 'node:process';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { dataRootOf } from './data-root.ts';
import { AndroidApkPublicationError } from './android-apk-publish.ts';
import { registerAndroidBaseline } from './android-apk-baseline.ts';
import { readAndroidUpdateHome } from './android-update-home.ts';
import { dataLayoutOf } from './release-hub-files.ts';

const OPTIONS = z.strictObject({
  data: z.string().min(1).optional(),
  apk: z.string().min(1),
  client: z.uuid(),
});

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { data: { type: 'string' }, apk: { type: 'string' }, client: { type: 'string' } },
  });
  const input = OPTIONS.parse(values);
  const data = dataLayoutOf(await dataRootOf(input.data, env));
  const path = E.readAndroidAppBuild.path.replace(':clientId', input.client);
  const readObservation = async (): Promise<AndroidAppObservation | null> =>
    E.readAndroidAppBuild.response.parse(await readAndroidUpdateHome(data, path));
  const [observation, settings] = await Promise.all([
    readObservation(),
    readAndroidUpdateHome(data, E.readSettings.path).then((reply) =>
      E.readSettings.response.parse(reply),
    ),
  ]);
  if (observation === null)
    throw new AndroidApkPublicationError('The paired device has not reported an Android build.');
  if (settings.public_url_verified_at === null || settings.public_url === null)
    throw new AndroidApkPublicationError('The hub needs a verified public HTTPS address.');
  const baseline = await registerAndroidBaseline({
    apk: resolve(input.apk),
    data,
    clientId: input.client,
    server: settings.public_url,
    observation,
    readObservation,
  });
  process.stdout.write(`${JSON.stringify(baseline)}\n`);
}

if (import.meta.main) await main();
