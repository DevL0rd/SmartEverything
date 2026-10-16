import type { Context } from '@deepseek-ai/cordis';
import type { SkillRegistry } from '@deepseek-ai/dsh-skill';
import { HarnessRuntimeError } from '../host/errors';

export async function withNativeSkills<T>(
  ctx: Context,
  operation: (skills: SkillRegistry) => Promise<T>,
): Promise<T> {
  if (ctx.get('skills') === undefined)
    throw new HarnessRuntimeError('capability_unsupported', 'Native skills are not enabled.');
  let outcome:
    | { readonly kind: 'result'; readonly value: T }
    | { readonly kind: 'failure'; readonly error: unknown }
    | undefined;
  const fiber = ctx.inject(['skills'], async (active: Context): Promise<void> => {
    const lifetime = active.fiber.uid;
    try {
      const value = await operation(active.skills);
      active.fiber.assertActive();
      if (active.fiber.uid !== lifetime || active.get('skills') === undefined)
        throw new HarnessRuntimeError(
          'capability_unsupported',
          'The native skill registry changed.',
        );
      outcome = { kind: 'result', value };
    } catch (error) {
      outcome = { kind: 'failure', error };
    }
  });
  try {
    await fiber;
    if (outcome === undefined)
      throw new HarnessRuntimeError(
        'capability_unsupported',
        'The native skill registry is unavailable.',
      );
    if (outcome.kind === 'failure') throw outcome.error;
    return outcome.value;
  } finally {
    await fiber.dispose();
  }
}
