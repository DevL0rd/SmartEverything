import { constants, lstatSync, realpathSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { CodegraphError } from './index.js';

export function confinedPath(root, path, absent = false) {
    const absolute = resolve(root, path);
    const suffix = relative(root, absolute);
    if (isAbsolute(suffix) || suffix === '..' || suffix.startsWith(`..${sep}`))
        throw new CodegraphError('Index source path escapes its project.', 'CODEGRAPH_PERMISSION_DENIED');
    let info;
    try {
        info = lstatSync(absolute);
    } catch (error) {
        if (absent && error instanceof Error && 'code' in error && error.code === 'ENOENT') return absolute;
        throw error;
    }
    if (info.isSymbolicLink() || realpathSync(absolute) !== absolute)
        throw new CodegraphError('Index source paths cannot traverse symbolic links.', 'CODEGRAPH_PERMISSION_DENIED');
    return absolute;
}

export async function readConfinedText(root, path, maxBytes, signal) {
    signal?.throwIfAborted();
    const absolute = confinedPath(root, path);
    const handle = await open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
        const info = await handle.stat();
        const current = lstatSync(confinedPath(root, path));
        if (!info.isFile() || info.dev !== current.dev || info.ino !== current.ino)
            throw new CodegraphError('Index source identity changed during open.', 'CODEGRAPH_PERMISSION_DENIED');
        if (info.size > maxBytes) return undefined;
        const bytes = Buffer.alloc(maxBytes + 1);
        let length = 0;
        while (length <= maxBytes) {
            signal?.throwIfAborted();
            const result = await handle.read(bytes, length, bytes.length - length, length);
            if (result.bytesRead === 0) break;
            length += result.bytesRead;
        }
        if (length > maxBytes) return undefined;
        return { text: bytes.subarray(0, length).toString('utf8'), stats: info };
    } finally {
        await handle.close();
    }
}
