import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export interface LiveEntry {
  readonly legacy: string;
  readonly v1: string;
}

export const HUB_ENTRIES: readonly LiveEntry[] = [
  { legacy: 'smarteverything.db', v1: 'system/database/smarteverything.db' },
  { legacy: 'smarteverything.db-wal', v1: 'system/database/smarteverything.db-wal' },
  { legacy: 'smarteverything.db-shm', v1: 'system/database/smarteverything.db-shm' },
  {
    legacy: 'smarteverything.db.pre-migration-6',
    v1: 'backups/legacy-database/smarteverything.db.pre-migration-6',
  },
  {
    legacy: 'smarteverything.db.pre-migration-6-wal',
    v1: 'backups/legacy-database/smarteverything.db.pre-migration-6-wal',
  },
  {
    legacy: 'smarteverything.db.pre-migration-6-shm',
    v1: 'backups/legacy-database/smarteverything.db.pre-migration-6-shm',
  },
  {
    legacy: 'smarteverything.db.pre-migration-7-wal',
    v1: 'backups/legacy-database/smarteverything.db.pre-migration-7-wal',
  },
  {
    legacy: 'smarteverything.db.pre-migration-7-shm',
    v1: 'backups/legacy-database/smarteverything.db.pre-migration-7-shm',
  },
  {
    legacy: 'smarteverything.db.failed-19',
    v1: 'backups/legacy-database/smarteverything.db.failed-19',
  },
  {
    legacy: 'smarteverything.v17x-before-v17y.sqlite',
    v1: 'backups/legacy-database/smarteverything.v17x-before-v17y.sqlite',
  },
  { legacy: 'owner-token', v1: 'system/keys/owner-token' },
  { legacy: 'secret.key', v1: 'system/keys/secret.key' },
  { legacy: 'secrets.json.enc', v1: 'system/keys/secrets.json.enc' },
  { legacy: 'hub-tls-identity.json', v1: 'system/keys/hub-tls-identity.json' },
  { legacy: 'service.json', v1: 'system/config/service.json' },
  { legacy: 'service.log', v1: 'system/logs/service.log' },
  { legacy: 'service.log.1', v1: 'system/logs/service.log.1' },
  { legacy: 'service-output.log', v1: 'system/logs/service-output.log' },
  { legacy: 'perf-samples.jsonl', v1: 'system/logs/perf-samples.jsonl' },
  { legacy: 'wake-diagnostics/w1.json', v1: 'system/logs/wake-diagnostics/w1.json' },
  { legacy: 'hub-update-watchdog.log', v1: 'system/logs/hub-update-watchdog.log' },
  { legacy: 'service.pid', v1: 'system/run/service.pid' },
  { legacy: 'service-ready.json', v1: 'system/run/service-ready.json' },
  { legacy: 'service-ready.json.879981', v1: 'system/migration/orphans/service-ready.json.879981' },
  { legacy: 'supervisor.pid', v1: 'system/run/supervisor.pid' },
  { legacy: 'service-restart', v1: 'system/run/service-restart' },
  { legacy: 'service-stop', v1: 'system/run/service-stop' },
  { legacy: 'node-window.json', v1: 'system/run/node-window.json' },
  { legacy: 'go2rtc/go2rtc.yaml', v1: 'system/run/go2rtc.yaml' },
  { legacy: 'size-scan.json', v1: 'system/run/size-scan.json' },
  { legacy: 'startup-journal-dev1.cursor', v1: 'system/journal/startup-journal-dev1.cursor' },
  { legacy: 'assistant/files/att1/photo.png', v1: 'system/ai/assistant/files/att1/photo.png' },
  {
    legacy: 'assistant/projects/chat1/notes.txt',
    v1: 'system/ai/assistant/projects/chat1/notes.txt',
  },
  { legacy: 'assistant/apps.json', v1: 'system/ai/assistant/apps.json' },
  { legacy: 'claude/link.token', v1: 'system/ai/claude/link.token' },
  { legacy: 'codex/sessions/s1.jsonl', v1: 'system/ai/codex/sessions/s1.jsonl' },
  { legacy: 'codex/workspaces/chat1/w.txt', v1: 'system/ai/codex/workspaces/chat1/w.txt' },
  { legacy: 'codex/inputs/in.txt', v1: 'cache/codex-inputs/in.txt' },
  { legacy: 'harness/attachments/ab/blob', v1: 'system/ai/harness/attachments/ab/blob' },
  { legacy: 'harness/store/s.json', v1: 'system/ai/harness/store/s.json' },
  { legacy: 'harness/cache/c1', v1: 'cache/harness/c1' },
  { legacy: 'plugins/aibi/photos/p.jpg', v1: 'system/plugins/aibi/photos/p.jpg' },
  { legacy: 'providers/xiaomi/miot-specs/a.json', v1: 'system/providers/xiaomi/miot-specs/a.json' },
  { legacy: 'watch-captures/w1.png', v1: 'system/developer/watch-captures/w1.png' },
  {
    legacy: 'app-updates/keys/private-key.pem',
    v1: 'system/updates/app-updates/keys/private-key.pem',
  },
  { legacy: 'app-updates.write.lock', v1: 'system/updates/app-updates.write.lock' },
  { legacy: 'android-apks/a.apk', v1: 'system/updates/android-apks/a.apk' },
  { legacy: 'machine-updates/m.zip', v1: 'system/updates/machine-updates/m.zip' },
  { legacy: 'machine-updates.previous/m.zip', v1: 'system/updates/machine-updates.previous/m.zip' },
  { legacy: 'self-update/ledger.json', v1: 'system/updates/self-update/ledger.json' },
  { legacy: 'drive/Shared/Saved/f.txt', v1: 'home/drive/Saved/f.txt' },
  { legacy: 'drive/Members/p1/doc.txt', v1: 'people/p1/drive/doc.txt' },
  { legacy: 'recordings/cam1/clip.mp4', v1: 'home/cameras/recordings/cam1/clip.mp4' },
  { legacy: 'talk/t1.wav', v1: 'home/talk/t1.wav' },
  { legacy: 'home-map-scans/sc1.json', v1: 'home/home-map/scans/sc1.json' },
  { legacy: 'voice-samples/v1.wav', v1: 'cache/voice-samples/v1.wav' },
  {
    legacy: 'providers/smartthings/capabilities/s.json',
    v1: 'cache/smartthings-capabilities/s.json',
  },
  {
    legacy: 'drive-derived/ab/ab12-1-thumb.webp',
    v1: 'cache/drive-derived/ab/ab12-1-thumb.webp',
  },
  { legacy: 'release-backups/r1/x.bin', v1: 'backups/releases/r1/x.bin' },
  { legacy: 'backups/b1/manual.bin', v1: 'backups/manual/b1/manual.bin' },
];

export const KEPT_ENTRIES: readonly string[] = ['server.lock', 'tmp/stage.part'];

async function writeEntry(root: string, path: string): Promise<void> {
  const file = join(root, ...path.split('/'));
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, path);
}

export async function writeLiveListing(root: string): Promise<void> {
  const paths = [...HUB_ENTRIES.map((entry) => entry.legacy), ...KEPT_ENTRIES];
  for (const path of paths) {
    await writeEntry(root, path);
  }
}
