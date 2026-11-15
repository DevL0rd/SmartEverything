import { join } from 'node:path';
import { env } from 'node:process';
import { REPO, SCRATCH, TMP } from '../paths.ts';

export const BENCH_DIR = import.meta.dirname;
export const INSTANCE = env['DRIVE_RIG_INSTANCE'] ?? '';
export const BENCH = INSTANCE === '' ? join(TMP, 'drive-fs-bench') : join(SCRATCH, 'bench');
const CACHE = INSTANCE === '' ? join(BENCH, 'cache') : join(TMP, `mount-bench-cache-${INSTANCE}`);
export const RESULTS = join(REPO, 'tmp', 'drive-mount-fs', 'results');

export const bench = {
  bin: join(BENCH, 'bin'),
  binary: join(BENCH, 'bin', 'bench'),
  helperBinary: join(BENCH, 'bin', 'se-drive-mount'),
  nfsdBinary: join(BENCH, 'bin', 'nfsd'),
  cache: CACHE,
  mirror: join(CACHE, 'git.git'),
  nfsMount: join(BENCH, 'nfs'),
  seMount: join(BENCH, 'se'),
  helperDirectory: join(BENCH, 'helper'),
  token: join(BENCH, 'token'),
  cacheDirectory: join(BENCH, 'helper', 'cache'),
  control: join(BENCH, 'helper', 'control'),
  status: join(BENCH, 'helper', 'status.log'),
  helperLog: join(BENCH, 'helper', 'helper.log'),
  pairing: join(BENCH, 'pairing.json'),
};

export const NAS = {
  host: 'nas',
  address: '192.168.50.254',
  nfsPort: 20490,
  exportFolder: '/srv/storage/cache/se-bench-nfs',
  toolFolder: '.local/opt/se-bench-nfs',
  nfsdName: 'se-bench-nfsd',
  ownerTokenFile: '.config/SmartEverything/owner-token',
  publicUrl: 'https://smarteverything.devl0rd.com',
  lanUrl: 'https://192.168.50.254:7882',
};

export const BENCH_FOLDER = 'SE-bench';
