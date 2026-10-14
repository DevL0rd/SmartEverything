import type { Context } from '@deepseek-ai/cordis';
import { z } from 'zod';

interface Surface {
  readonly agents: ReadonlySet<string>;
  readonly skills: ReadonlySet<string>;
}
const surfaces = new WeakMap<Context, Set<Surface>>();
export function registerManagedPluginSurfaces(
  ctx: Context,
  agents: readonly string[],
  skills: readonly string[] | Set<string>,
): () => void {
  const surface = {
    agents: new Set(agents),
    skills: skills instanceof Set ? skills : new Set(skills),
  };
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
export function isManagedPluginSkillRequest(ctx: Context, raw: unknown): boolean {
  const request = z.strictObject({ name: z.string() }).safeParse(raw);
  return (
    request.success &&
    [...(surfaces.get(ctx) ?? [])].some((surface) => surface.skills.has(request.data.name))
  );
}
