import { updateExecutableOf } from '../squirrel.js';

export type InstallKind =
  | { readonly kind: 'folder'; readonly root: string }
  | { readonly kind: 'bundle'; readonly root: string }
  | { readonly kind: 'squirrel' }
  | { readonly kind: 'unmanaged'; readonly reason: string };

export interface InstallProbe {
  readonly writable: (path: string) => Promise<boolean>;
  readonly exists: (path: string) => Promise<boolean>;
}

export interface InstallFacts {
  readonly platform: NodeJS.Platform;
  readonly execPath: string;
  readonly packaged: boolean;
}

const PACKAGE_MANAGED = ['/usr/', '/opt/', '/snap/', '/var/lib/flatpak/'] as const;
const BUNDLE_MARKER = '.app/';

function parentOf(path: string): string {
  const cut = path.lastIndexOf('/');
  return cut <= 0 ? '/' : path.slice(0, cut);
}

async function unpackedFolder(facts: InstallFacts, probe: InstallProbe): Promise<InstallKind> {
  const root = parentOf(facts.execPath);
  if (PACKAGE_MANAGED.some((prefix) => root.startsWith(prefix))) {
    return { kind: 'unmanaged', reason: 'This copy was installed by a package; update it there.' };
  }
  const replaceable = (await probe.writable(root)) && (await probe.writable(parentOf(root)));
  return replaceable
    ? { kind: 'folder', root }
    : { kind: 'unmanaged', reason: 'This copy sits in a folder SmartEverything may not change.' };
}

async function appBundle(facts: InstallFacts, probe: InstallProbe): Promise<InstallKind> {
  const cut = facts.execPath.indexOf(BUNDLE_MARKER);
  if (cut < 0) return { kind: 'unmanaged', reason: 'This copy is not inside an app bundle.' };
  const root = facts.execPath.slice(0, cut + BUNDLE_MARKER.length - 1);
  return (await probe.writable(parentOf(root)))
    ? { kind: 'bundle', root }
    : { kind: 'unmanaged', reason: 'The Applications folder is read-only for this account.' };
}

export async function installKindOf(
  facts: InstallFacts,
  probe: InstallProbe,
): Promise<InstallKind> {
  if (!facts.packaged) return { kind: 'unmanaged', reason: 'This is a development copy.' };
  if (facts.platform === 'linux') return unpackedFolder(facts, probe);
  if (facts.platform === 'darwin') return appBundle(facts, probe);
  if (facts.platform !== 'win32') {
    return { kind: 'unmanaged', reason: `Updates are not offered for ${facts.platform}.` };
  }
  return (await probe.exists(updateExecutableOf(facts.execPath)))
    ? { kind: 'squirrel' }
    : { kind: 'unmanaged', reason: 'This copy was not set up by the installer.' };
}
