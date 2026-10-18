import type { Context } from '@deepseek-ai/cordis';

interface Surface {
  readonly agents: ReadonlySet<string>;
}
const surfaces = new WeakMap<Context, Set<Surface>>();
export function registerManagedPluginSurfaces(ctx: Context, agents: readonly string[]): () => void {
  const surface = { agents: new Set(agents) };
  const registered = surfaces.get(ctx) ?? new Set<Surface>();
  registered.add(surface);
  surfaces.set(ctx, registered);
  return (): void => {
    registered.delete(surface);
    if (registered.size === 0) surfaces.delete(ctx);
  };
}
export function managedPluginAgentNames(ctx: Context): readonly string[] {
  return [...new Set([...(surfaces.get(ctx) ?? [])].flatMap((surface) => [...surface.agents]))];
}
