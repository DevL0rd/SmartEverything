import { z } from 'zod';
import type { JsonValue } from '@smarteverything/domain';
import type { PluginTool } from '../contract';
import { definePluginTool } from '../define';
import {
  attemptTool,
  DANGER_HINTS,
  NO_INPUT,
  ownerOnly,
  READ_HINTS,
  WRITE_HINTS,
} from '../tool-kit';

export interface OpenRgbToolPorts {
  readonly status: () => Promise<Readonly<Record<string, JsonValue>>>;
  readonly loadProfile: (name: string) => Promise<void>;
  readonly saveProfile: (name: string) => Promise<void>;
}

const MAX_PROFILE_NAME = 64;
const PROFILE_NAME = z
  .string()
  .regex(
    new RegExp(`^[A-Za-z0-9][A-Za-z0-9 _-]{0,${String(MAX_PROFILE_NAME - 1)}}$`),
    'letters, digits, spaces, dashes and underscores, starting with a letter or digit',
  );

export function openRgbTools(ports: OpenRgbToolPorts): PluginTool[] {
  return [
    definePluginTool({
      name: 'status',
      title: 'OpenRGB status',
      description:
        'Whether the OpenRGB server is connected, its lights (power, brightness, colour, effect) and its saved profiles. Control each light through the shared device tools.',
      input: NO_INPUT,
      annotations: READ_HINTS,
      humanOnly: false,
      run: () => attemptTool(ports.status),
    }),
    definePluginTool({
      name: 'load_profile',
      title: 'Load an OpenRGB profile',
      description:
        'Applies a saved OpenRGB profile (every light changes to what the profile stored). Profile names come from status.',
      input: z.strictObject({ name: PROFILE_NAME }),
      annotations: WRITE_HINTS,
      humanOnly: false,
      run: ({ name }) =>
        attemptTool(async () => {
          await ports.loadProfile(name);
          return { loaded: name };
        }),
    }),
    definePluginTool({
      name: 'save_profile',
      title: 'Save an OpenRGB profile',
      description:
        'Stores the lights as they are now under a profile name in OpenRGB, replacing a profile of the same name. Owner only.',
      input: z.strictObject({ name: PROFILE_NAME }),
      annotations: DANGER_HINTS,
      humanOnly: false,
      run: ({ name }, caller) =>
        ownerOnly(caller, 'Only the home owner can save an OpenRGB profile', () =>
          attemptTool(async () => {
            await ports.saveProfile(name);
            return { saved: name };
          }),
        ),
    }),
  ];
}
