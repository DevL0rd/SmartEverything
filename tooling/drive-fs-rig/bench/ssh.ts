import { run } from '../processes.ts';
import { NAS } from './paths.ts';

const SSH_OPTIONS = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15'];

export async function remote(script: string): Promise<string> {
  const { stdout } = await run('ssh', [...SSH_OPTIONS, NAS.host, script]);
  return stdout;
}

export async function copyToNas(local: string, remotePath: string): Promise<void> {
  await run('scp', ['-q', ...SSH_OPTIONS, local, `${NAS.host}:${remotePath}`]);
}
