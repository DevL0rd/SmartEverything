import { createHash } from 'node:crypto';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  MACHINE_UPDATE_MANIFEST,
  MACHINE_UPDATE_NOTICE,
  type AppUpdateNotice,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { watchMachineUpdates } from '../../apps/hub/src/updates/machine-update-watch';
import { rollbackRelease, withdrawRelease } from '../machine-update-client.ts';
import {
  ReleaseFileArgumentError,
  publishLocalDesktop,
  publishMachineUpdate,
  releaseFileOf,
} from '../release-machine-update.ts';
import {
  FIXTURE_ARCHIVES,
  NOTES,
  PUBLICATION,
  WEB_PAYLOAD,
  built,
  deferred,
  publisherFor,
  releaseHub,
  useReleaseHub,
  useReleaseWorkspace,
} from './release-machine-update-fixture.ts';

useReleaseWorkspace();
useReleaseHub();

const LINUX = { platform: 'linux', arch: 'x64', kind: 'zip' } as const;

async function offered(): Promise<string | undefined> {
  const offer = await releaseHub().hub.updates.offer({
    product: 'desktop-computer',
    platform: 'linux',
    arch: 'x64',
  });
  return offer?.version;
}

async function absent(path: string): Promise<boolean> {
  return stat(path).then(
    () => false,
    () => true,
  );
}

describe('publishing a desktop release to a hub over the network', () => {
  it('uploads the verified files and publishes the complete multiline notes together', async () => {
    const zip = await built('SmartEverything-linux-x64-0.4.2.zip', '0.4.2');
    const { hub, target } = releaseHub();
    const manifest = await publishMachineUpdate(target, '0.4.2', [{ ...LINUX, path: zip }], {
      notes: ` ${NOTES} \n`,
    });
    const bytes = await readFile(zip);
    expect(manifest.artifacts[0]).toStrictEqual({
      ...LINUX,
      file: 'SmartEverything-linux-x64-0.4.2.zip',
      sha256: createHash('sha256').update(bytes).digest('hex'),
      size: bytes.length,
    });
    const stored = hub.layout.system.updates.machineUpdates;
    expect((await readdir(stored)).sort()).toStrictEqual([
      'SmartEverything-linux-x64-0.4.2.zip',
      'manifest.json',
    ]);
    expect(
      MACHINE_UPDATE_MANIFEST.parse(
        JSON.parse(await readFile(join(stored, 'manifest.json'), 'utf8')),
      ),
    ).toStrictEqual({ ...manifest, version: '0.4.2', notes: NOTES });
    expect(await offered()).toBe('0.4.2');
  });

  it('keeps the active release if the next ZIP embeds a different version than its label', async () => {
    const { target } = releaseHub();
    const active = await built('desktop-0.4.1.zip', '0.4.1');
    const wrong = await built('desktop-0.4.2.zip', '0.4.1');
    await publishMachineUpdate(target, '0.4.1', [{ ...LINUX, path: active }], PUBLICATION);
    await expect(
      publishMachineUpdate(target, '0.4.2', [{ ...LINUX, path: wrong }], PUBLICATION),
    ).rejects.toThrow('embeds version 0.4.1; expected 0.4.2');
    expect(await offered()).toBe('0.4.1');
  });

  it.each([
    { resources: 'SmartEverything-linux-x64/nested/resources' },
    { resources: 'SmartEverything-linux-x64/Resources' },
    { extra: ['another-root/readme.txt'] },
  ])('refuses a Linux ZIP whose files are outside the canonical layout (%j)', async (fixture) => {
    const { hub, target } = releaseHub();
    const path = await built('desktop.zip', '0.4.2', fixture);
    await expect(
      publishMachineUpdate(target, '0.4.2', [{ ...LINUX, path }], PUBLICATION),
    ).rejects.toThrow('Desktop installer');
    expect(await absent(`${hub.layout.system.updates.machineUpdates}.next`)).toBe(true);
  });

  it('keeps the active ZIP when a matching candidate has a corrupt non-ASAR member', async () => {
    const { target } = releaseHub();
    const active = await built('desktop-0.4.1.zip', '0.4.1');
    const corrupt = await built('desktop-0.4.2.zip', '0.4.2');
    const bytes = await readFile(corrupt);
    const offset = bytes.indexOf(WEB_PAYLOAD);
    expect(offset).toBeGreaterThan(0);
    bytes.writeUInt8(0, offset);
    await writeFile(corrupt, bytes);
    await publishMachineUpdate(target, '0.4.1', [{ ...LINUX, path: active }], PUBLICATION);
    await expect(
      publishMachineUpdate(target, '0.4.2', [{ ...LINUX, path: corrupt }], PUBLICATION),
    ).rejects.toThrow('valid ZIP member checksums');
    expect(await offered()).toBe('0.4.1');
  });

  it.each([
    { platform: 'linux', kind: 'zip' },
    { platform: 'darwin', kind: 'zip' },
    { platform: 'win32', kind: 'nupkg' },
  ] as const)(
    'refuses a $platform package missing the wake vocabulary',
    async ({ platform, kind }) => {
      const omit = 'computer/wake-name-model/bpe.vocab';
      const path = await built(`SmartEverything.${kind}`, '0.4.2', { platform, omit });
      await expect(
        publishMachineUpdate(
          releaseHub().target,
          '0.4.2',
          [{ platform, arch: 'x64', kind, path }],
          PUBLICATION,
        ),
      ).rejects.toThrow(`is missing ${FIXTURE_ARCHIVES[platform].resources}/${omit}`);
      expect(await offered()).toBeUndefined();
    },
  );

  it.each([
    {
      platform: 'linux',
      kind: 'zip',
      entry: 'SmartEverything-linux-x64/resources/service/service.mjs',
    },
    { platform: 'win32', kind: 'nupkg', entry: 'lib/net45/resources/go2rtc/go2rtc.exe' },
  ] as const)(
    'refuses hub resources in a $platform desktop installer before uploading',
    async (file) => {
      const { hub, target } = releaseHub();
      const path = await built(`SmartEverything.${file.kind}`, '0.4.2', {
        platform: file.platform,
        extra: [file.entry],
      });
      await expect(
        publishMachineUpdate(
          target,
          '0.4.2',
          [{ platform: file.platform, arch: 'x64', kind: file.kind, path }],
          PUBLICATION,
        ),
      ).rejects.toThrow('contains the hub resource');
      expect(await absent(`${hub.layout.system.updates.machineUpdates}.next`)).toBe(true);
    },
  );

  it('announces an atomic installer publish with the packaged Web runtime', async () => {
    const { hub, target } = releaseHub();
    const zip = await built('SmartEverything-linux-x64-0.4.2.zip', '0.4.2');
    const runtimeVersion = '9724ce88e713205c662d9dfd3284b029';
    const { promise, resolve } = deferred<AppUpdateNotice>();
    const stop = watchMachineUpdates(hub.layout, hub.folder, resolve);
    try {
      await publishMachineUpdate(target, '0.4.2', [{ ...LINUX, path: zip }], {
        notes: NOTES,
        runtimeVersion,
      });
      const notice = MACHINE_UPDATE_NOTICE.parse(
        JSON.parse(
          await readFile(join(hub.layout.system.updates.machineUpdates, 'notice.json'), 'utf8'),
        ),
      );
      await expect(promise).resolves.toStrictEqual({
        type: 'app_update',
        platform: 'desktop',
        channel: 'release',
        id: notice.id,
        runtimeVersion,
      });
    } finally {
      await stop();
    }
  });

  it('announces a withdrawal once, without a transient withdrawal during a swap', async () => {
    const { hub, target } = releaseHub();
    const earlier = await built('SmartEverything-linux-x64-0.4.1.zip', '0.4.1');
    const later = await built('SmartEverything-linux-x64-0.4.2.zip', '0.4.2');
    const runtimeVersion = '9724ce88e713205c662d9dfd3284b029';
    const first = deferred<null>();
    const next = deferred<null>();
    const withdrawn = deferred<null>();
    const ids: (string | null)[] = [];
    const stop = watchMachineUpdates(hub.layout, hub.folder, (notice) => {
      ids.push(notice.id);
      if (ids.length === 1) first.resolve(null);
      if (ids.length === 2) next.resolve(null);
      if (notice.id === null) withdrawn.resolve(null);
    });
    try {
      const metadata = { notes: NOTES, runtimeVersion };
      await publishMachineUpdate(target, '0.4.1', [{ ...LINUX, path: earlier }], metadata);
      await first.promise;
      await publishMachineUpdate(target, '0.4.2', [{ ...LINUX, path: later }], metadata);
      await next.promise;
      expect(ids).toHaveLength(2);
      expect(ids).not.toContain(null);
      await withdrawRelease(target);
      await withdrawn.promise;
      expect(ids).toHaveLength(3);
      expect(ids[2]).toBeNull();
      expect(await offered()).toBeUndefined();
    } finally {
      await stop();
    }
  });

  it('keeps the earlier release as the previous one and rolls back to it', async () => {
    const { hub, target } = releaseHub();
    const first = await built('a-1.zip', '0.4.1');
    const second = await built('a-2.zip', '0.4.2');
    await publishMachineUpdate(target, '0.4.1', [{ ...LINUX, path: first }], PUBLICATION);
    await publishMachineUpdate(target, '0.4.2', [{ ...LINUX, path: second }], PUBLICATION);
    expect(await readdir(hub.layout.system.updates.machineUpdatesPrevious)).toContain('a-1.zip');
    expect(await readdir(hub.layout.system.updates.machineUpdates)).toContain('a-2.zip');
    expect((await rollbackRelease(target)).version).toBe('0.4.1');
    expect(await offered()).toBe('0.4.1');
  });
});

describe('the publisher client', () => {
  it('publishes through the local hub found from the data layout alone', async () => {
    const { hub } = releaseHub();
    const path = await built('desktop-0.4.2.zip', '0.4.2');
    const manifest = await publishLocalDesktop(hub.layout, '0.4.2', [{ ...LINUX, path }], {
      notes: NOTES,
    });
    expect(manifest.version).toBe('0.4.2');
    expect(await offered()).toBe('0.4.2');
  });

  it('is refused by the hub when its token belongs to a member', async () => {
    const { hub } = releaseHub();
    const member = await publisherFor(hub, 'member');
    const path = await built('desktop-0.4.2.zip', '0.4.2');
    await expect(
      publishMachineUpdate(member.target, '0.4.2', [{ ...LINUX, path }], PUBLICATION),
    ).rejects.toMatchObject({ code: 'forbidden' });
    expect(await offered()).toBeUndefined();
  });
});

describe('reading the --file argument', () => {
  it('splits platform, architecture, kind and path', () => {
    expect(releaseFileOf('win32:x64:releases=out/RELEASES')).toStrictEqual({
      platform: 'win32',
      arch: 'x64',
      kind: 'releases',
      path: 'out/RELEASES',
    });
  });

  it('names what it expected when the argument is malformed', () => {
    expect(() => releaseFileOf('linux=out/app.zip')).toThrow(ReleaseFileArgumentError);
  });
});
