import { normalKey, type DeviceCapability } from '@smarteverything/domain';

const PAD_DIRECTIONS = ['up', 'down', 'left', 'right', 'ok'] as const;

export type PadDirection = (typeof PAD_DIRECTIONS)[number];

const PAD_WORDS: Readonly<Record<PadDirection, readonly string[]>> = {
  up: ['up', 'arrow_up', 'dpad_up', 'key_up'],
  down: ['down', 'arrow_down', 'dpad_down', 'key_down'],
  left: ['left', 'arrow_left', 'dpad_left', 'key_left'],
  right: ['right', 'arrow_right', 'dpad_right', 'key_right'],
  ok: ['ok', 'enter', 'select', 'key_enter', 'confirm'],
};

export interface RemoteLayout {
  readonly pad: Readonly<Partial<Record<PadDirection, string>>>;
  readonly rest: readonly string[];
}

export function remoteLayout(options: readonly string[]): RemoteLayout {
  const pad: Partial<Record<PadDirection, string>> = {};
  const rest: string[] = [];
  for (const option of options) {
    const direction = PAD_DIRECTIONS.find(
      (candidate) =>
        pad[candidate] === undefined && PAD_WORDS[candidate].includes(normalKey(option)),
    );
    if (direction === undefined) {
      rest.push(option);
    } else {
      pad[direction] = option;
    }
  }
  return { pad, rest };
}

export function isButtonName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= 60;
}

export function remoteKeysOf(capabilities: readonly DeviceCapability[]): readonly string[] {
  const found = capabilities.find(
    (capability) => capability.key === 'remote_key' && capability.access !== 'read',
  );
  return found?.value.kind === 'enum' ? found.value.options : [];
}

export function canLearn(capabilities: readonly DeviceCapability[]): boolean {
  return capabilities.some(
    (capability) => capability.key === 'ir_learn' && capability.access !== 'read',
  );
}
