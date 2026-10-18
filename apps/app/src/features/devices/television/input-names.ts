import { inputLabel, type TvInput } from '@smarteverything/domain';
import type { TextEditRequest } from '../../../settings/text-edit-sheet';

const INPUT_NAME_MAX_LENGTH = 40;

export function withInputName(
  inputs: readonly TvInput[],
  id: string,
  name: string,
): Readonly<Record<string, string>> {
  const named = inputs.flatMap((input) =>
    input.id === id || input.name === null ? [] : [[input.id, input.name] as const],
  );
  return Object.fromEntries(name === '' ? named : [...named, [id, name]]);
}

export function inputRenameRequest(
  input: TvInput,
  rename: (id: string, name: string) => Promise<void>,
): TextEditRequest {
  return {
    id: input.id,
    title: 'Rename input',
    label: 'Name',
    initial: input.name ?? '',
    placeholder: inputLabel(input.id),
    confirmLabel: 'Rename',
    maxLength: INPUT_NAME_MAX_LENGTH,
    allowEmpty: true,
    helper: 'Leave it empty to use the default name.',
    save: (value) => rename(input.id, value),
  };
}
