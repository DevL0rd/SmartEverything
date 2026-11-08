import { z } from 'zod';
import { VacuumValueError, type DevicePresentation, type JsonValue } from '@smarteverything/domain';
import { presentedFor } from './presented-refs';
import { readingOf } from './readings';

export interface AboutFact {
  readonly id: 'software' | 'firmware' | 'model' | 'serial';
  readonly title: string;
  readonly text: string;
  readonly copyable: boolean;
}

export const ABOUT_REFS: readonly string[] = ['raw:2.1', 'firmware', 'raw:1.2', 'raw:1.5'];

const SOFTWARE_VERSION = z.object({ base_version: z.string().min(1) });

function textOf(value: JsonValue | undefined): string | null {
  if (typeof value === 'number') {
    return String(value);
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

const SOFTWARE_EXPECTED = 'a version or a JSON object with base_version';

export const UNREADABLE_FACT = 'Not readable';

function versionJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new VacuumValueError('raw:2.1', SOFTWARE_EXPECTED, text, { cause });
  }
}

export function softwareVersionOf(value: JsonValue | undefined): string | null {
  const text = textOf(value);
  if (text === null) {
    return null;
  }
  if (!text.startsWith('{')) {
    return text;
  }
  const parsed = SOFTWARE_VERSION.safeParse(versionJson(text));
  if (!parsed.success) {
    throw new VacuumValueError('raw:2.1', SOFTWARE_EXPECTED, text);
  }
  return parsed.data.base_version;
}

export interface AboutSource {
  readonly presentation: DevicePresentation;
  readonly read: (key: string) => JsonValue | undefined;
  readonly deviceModel: string;
}

function valueFor(source: AboutSource, ref: string): JsonValue | undefined {
  const presented = presentedFor(source.presentation, ref);
  return presented === undefined ? undefined : source.read(presented.key);
}

function fact(
  id: AboutFact['id'],
  title: string,
  text: string | null,
  copyable = false,
): readonly AboutFact[] {
  return text === null ? [] : [{ id, title, text, copyable }];
}

export function aboutFactsOf(source: AboutSource): readonly AboutFact[] {
  const reading = readingOf(() => softwareVersionOf(valueFor(source, 'raw:2.1')));
  const software = reading.ok ? reading.value : UNREADABLE_FACT;
  const firmware = textOf(valueFor(source, 'firmware'));
  const model = textOf(valueFor(source, 'raw:1.2')) ?? source.deviceModel;
  return [
    ...fact('software', 'Robot software', software),
    ...fact('firmware', 'Firmware', firmware === software ? null : firmware),
    ...fact('model', 'Model', model),
    ...fact('serial', 'Serial number', textOf(valueFor(source, 'raw:1.5')), true),
  ];
}
