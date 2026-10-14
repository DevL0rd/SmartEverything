import { constants } from 'node:fs';
import { lstat, open, type FileHandle } from 'node:fs/promises';
import { join } from 'node:path';
import { HubTransportError } from '../client-network/policy';
const MAX_FILE_BYTES = 128 * 1024;
export async function readPrivateServiceFile(directory: string, name: string): Promise<string> {
  const uid = process.getuid?.();
  if (uid === undefined) throw new HubTransportError('Owned private service files require Unix');
  const parent = await lstat(directory);
  if (!parent.isDirectory() || parent.uid !== uid || (parent.mode & 0o077) !== 0)
    throw new HubTransportError('Route authority directory must be private and owned by this user');
  const file = await open(
    join(directory, name),
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const stat = await file.stat();
    if (
      !stat.isFile() ||
      stat.uid !== uid ||
      (stat.mode & 0o077) !== 0 ||
      stat.size > MAX_FILE_BYTES
    )
      throw new HubTransportError(
        'Route authority file must be bounded, private and owned by this user',
      );
    return await readBoundedFile(file);
  } finally {
    await file.close();
  }
}

async function readBoundedFile(file: FileHandle): Promise<string> {
  const buffer = Buffer.alloc(MAX_FILE_BYTES + 1);
  const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
  if (bytesRead > MAX_FILE_BYTES)
    throw new HubTransportError('Private service file exceeds its limit');
  return buffer.subarray(0, bytesRead).toString('utf8');
}
