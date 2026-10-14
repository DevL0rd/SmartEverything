import type { ChatTimelineTool } from '@smarteverything/domain';
import { toolActionTitle, toolActivityGoal } from './tool-presentation';

const GOALS: readonly (readonly [RegExp, string])[] = [
  [/^(?:Search (?:the )?web|Web search)\b/i, 'Searching the web'],
  [/^Read (?:a file|file contents|[^ ]+\.[a-z0-9]+)\b/i, 'Reading files'],
  [/^(?:Write |Edit |Update files)/i, 'Updating files'],
  [/^(?:Search file|Find files)/i, 'Searching files'],
  [/^(?:Check code|Check formatting|Run checks)/i, 'Checking code'],
  [/^Build the app/i, 'Building the app'],
  [/^Inspect (?:the working folder|code changes)/i, 'Inspecting the workspace'],
  [/^Run /i, 'Running commands'],
  [/^Read the home/i, 'Checking devices'],
  [/^Change device/i, 'Updating devices'],
  [/^(?:Create or edit images|Choose an image|Check available image)/i, 'Working with images'],
  [/^Stop an image/i, 'Stopping an image request'],
  [/^Ask for your input/i, 'Getting your input'],
];
export function toolGroupGoal(
  tools: readonly ChatTimelineTool[],
  pluginName: (id: string) => string | null,
): string {
  const goals = [
    ...new Set(
      tools.map((tool) => {
        const title = toolActionTitle(tool, pluginName);
        return (
          GOALS.find(([pattern]) => pattern.test(title))?.[1] ??
          toolActivityGoal(tool) ??
          'Working on your request'
        );
      }),
    ),
  ];
  return goals.length > 2 ? 'Working on your request' : goals.join(' · ');
}
