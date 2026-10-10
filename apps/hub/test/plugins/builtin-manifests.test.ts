import { PLUGIN_MANIFEST } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { BUILTIN_PLUGINS } from '../../src/plugins/builtin';

describe('builtin plugin manifests', () => {
  it.each(BUILTIN_PLUGINS.map((plugin) => [plugin.manifest.id, plugin] as const))(
    '%s parses as a plugin manifest',
    (_id, plugin) => {
      const parsed = PLUGIN_MANIFEST.safeParse(plugin.manifest);
      expect(parsed.success ? null : parsed.error.issues).toBeNull();
    },
  );
});
