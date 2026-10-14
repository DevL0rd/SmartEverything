import type { Context } from '@deepseek-ai/cordis';
import type { InstalledHarnessSkillAsset } from '../composition/skill-assets';

export interface NativeReferencePackage {
  readonly asset: InstalledHarnessSkillAsset;
  readonly name: string;
  readonly description: string;
  readonly agents: readonly {
    readonly identity: string;
    readonly name: string;
    readonly tool: string;
    readonly description: string;
  }[];
  readonly restrictedCommands: readonly string[];
}
const packages = new WeakMap<Context, Set<NativeReferencePackage>>();
export function registerReferencePackages(
  ctx: Context,
  entries: readonly NativeReferencePackage[],
): () => void {
  const current = packages.get(ctx) ?? new Set<NativeReferencePackage>();
  for (const entry of entries) current.add(entry);
  packages.set(ctx, current);
  return (): void => {
    for (const entry of entries) current.delete(entry);
    if (current.size === 0) packages.delete(ctx);
  };
}
export function nativeReferencePackages(ctx: Context): readonly NativeReferencePackage[] {
  return [...(packages.get(ctx) ?? [])];
}
