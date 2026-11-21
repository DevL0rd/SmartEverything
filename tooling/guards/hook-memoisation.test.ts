import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { applicationSource, repositoryRoot } from './repository-files';

const appRequire = createRequire(join(repositoryRoot, 'apps', 'app', 'package.json'));
const expoRequire = createRequire(appRequire.resolve('babel-preset-expo'));
const babel = z
  .object({ transformSync: z.custom<(code: string, options: object) => unknown>() })
  .parse(appRequire('@babel/core'));
const typescriptPreset = expoRequire.resolve('@babel/preset-typescript');
const compilerPlugin = appRequire.resolve('babel-plugin-react-compiler');

const EVENT = z.object({
  kind: z.string(),
  fnName: z.string().nullish(),
  memoBlocks: z.number().optional(),
  prunedMemoBlocks: z.number().optional(),
});

interface Compiled {
  readonly memoBlocks: number;
  readonly prunedMemoBlocks: number;
}

const HOOKS: Readonly<Record<string, readonly string[]>> = {
  'features/device-groups/data/use-group-draft.ts': ['useRunner', 'useGroupDraft'],
  'features/devices/microwave/use-program-sender.ts': ['useProgramSender'],
  'features/assistant/details/project-files.ts': ['useProjectList'],
  'features/assistant/voice-message/use-clip-playback.ts': ['useClipSessions', 'useClipPlayback'],
  'features/assistant/commands/submission.ts': ['useCommandPending'],
  'features/assistant/data/chat-store.ts': ['useLiveTurn'],
  'features/assistant/data/message-reactions.ts': ['useReactionToggle'],
  'features/app-updates/data/update-checks.ts': ['useCheckRun', 'useUpdateChecks'],
  'features/app-updates/data/android-update-history.ts': ['useAndroidUpdateHistory'],
  'features/computers/data/subscription.ts': ['useAlive', 'useSubscriptionControl'],
  'features/automations/runs/test/use-test-start.ts': ['useTestStart'],
  'features/assistant/picker/library/library-refresh.ts': ['useModelsRefresh'],
  'design/colour.ts': ['useColourResolver'],
  'components/widget-board/action-band.tsx': ['useBandItems'],
  'components/update-details-focus.ts': ['useUpdateDetailsFallback'],
  'components/page-shell/shell-body.tsx': ['useScrollLayoutEvent'],
  'features/automations/editor/inspector/values/literal-composite.tsx': ['useStates'],
  'features/automations/editor/canvas/nodes/card-shell.tsx': ['useShownPins'],
};

function compiledHooks(path: string): ReadonlyMap<string, Compiled> {
  const file = join(applicationSource, path);
  const compiled = new Map<string, Compiled>();
  babel.transformSync(readFileSync(file, 'utf8'), {
    filename: file,
    babelrc: false,
    configFile: false,
    code: false,
    presets: [[typescriptPreset, { isTSX: path.endsWith('.tsx'), allExtensions: true }]],
    plugins: [
      [
        compilerPlugin,
        {
          target: '19',
          logger: {
            logEvent: (_: unknown, raw: unknown): void => {
              const event = EVENT.parse(raw);
              if (event.kind !== 'CompileSuccess' || typeof event.fnName !== 'string') return;
              compiled.set(event.fnName, {
                memoBlocks: event.memoBlocks ?? 0,
                prunedMemoBlocks: event.prunedMemoBlocks ?? 0,
              });
            },
          },
        },
      ],
    ],
  });
  return compiled;
}

describe('hooks that return callbacks, objects or arrays keep their React Compiler memo blocks', () => {
  for (const [path, hooks] of Object.entries(HOOKS)) {
    it(`compiles with memo blocks ${hooks.join(', ')} in ${path}`, () => {
      const compiled = compiledHooks(path);
      for (const hook of hooks) {
        const result = compiled.get(hook);
        expect(result, `${hook} did not compile`).toBeDefined();
        expect(result?.memoBlocks, `${hook} has no memo block`).toBeGreaterThan(0);
        expect(result?.prunedMemoBlocks, `${hook} lost a memo block`).toBe(0);
      }
    });
  }
});
