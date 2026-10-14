import { lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { CodegraphError } from 'dsh-plugin-codegraph-service';

export function resolveProjectRoot(ctx, explicit, exec, write) {
    if (exec.agent === undefined)
        throw new CodegraphError('Codegraph requires an owned session with a current workspace.', 'CODEGRAPH_WORKSPACE_REQUIRED');
    exec.signal.throwIfAborted();
    const workspace = realpathSync(ctx.workingDirectory.get(exec.agent.session));
    const requested = explicit === undefined ? workspace : resolve(workspace, explicit);
    const root = realpathSync(requested);
    const path = relative(workspace, root);
    if (isAbsolute(path) || path === '..' || path.startsWith(`..${sep}`))
        throw new CodegraphError('Codegraph project_path must remain in the effective current workspace.', 'CODEGRAPH_PERMISSION_DENIED');
    const policy = ctx.sandboxPolicy.resolve({ session: exec.agent.session });
    if (write && policy.mode === 'read-only')
        throw new CodegraphError('Read-only sessions cannot build or refresh a code index.', 'CODEGRAPH_PERMISSION_DENIED');
    if (!lstatSync(root).isDirectory())
        throw new CodegraphError('Codegraph project_path must be a directory.', 'CODEGRAPH_WORKSPACE_REQUIRED');
    checkIndexPath(root);
    return root;
}

function checkIndexPath(root) {
    for (const suffix of ['.codegraph', '.codegraph/codegraph.db', '.codegraph/codegraph.db-wal', '.codegraph/codegraph.db-shm']) {
        const path = join(root, suffix);
        let info;
        try {
            info = lstatSync(path);
        } catch (error) {
            if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue;
            throw error;
        }
        if (info.isSymbolicLink() || realpathSync(path) !== path)
            throw new CodegraphError('Codegraph index paths cannot traverse symbolic links.', 'CODEGRAPH_PERMISSION_DENIED');
        if (suffix === '.codegraph' ? !info.isDirectory() : !info.isFile())
            throw new CodegraphError('Codegraph index path has an unexpected file type.', 'CODEGRAPH_PERMISSION_DENIED');
    }
}
