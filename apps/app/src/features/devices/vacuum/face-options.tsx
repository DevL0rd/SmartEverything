import type { ReactNode } from 'react';
import { z } from 'zod';
import { Logger } from '@smarteverything/logging';
import { Select, type SelectOption } from '../../../components/select';
import type { StageView } from './components/map-view-model';

const log = new Logger('app.devices');

export const FACE_VIEWS = ['3d', 'camera'] as const satisfies readonly StageView[];

export const VACUUM_FACE_FIELDS = {
  vacuumView: z.enum(FACE_VIEWS).optional(),
} as const;

export const VACUUM_FACE_OPTIONS = z.object(VACUUM_FACE_FIELDS);

export interface VacuumFaceOptions {
  readonly view: StageView;
}

export const DEFAULT_FACE_OPTIONS: VacuumFaceOptions = { view: '3d' };

export const VIEW_CHOICES: readonly SelectOption<StageView>[] = [
  { value: '3d', label: '3D map' },
  { value: 'camera', label: 'Camera' },
];

export function faceOptionsOf(options: unknown): VacuumFaceOptions {
  const parsed = VACUUM_FACE_OPTIONS.safeParse(options ?? {});
  if (!parsed.success) {
    log.warn('vacuum.face_options_invalid', { issues: parsed.error.issues.length });
    return DEFAULT_FACE_OPTIONS;
  }
  return { view: parsed.data.vacuumView ?? DEFAULT_FACE_OPTIONS.view };
}

export function VacuumFaceOptionsEditor({
  view,
  onChange,
}: {
  readonly view: StageView;
  readonly onChange: (view: StageView) => void;
}): ReactNode {
  return <Select label="Main view" options={VIEW_CHOICES} value={view} onChange={onChange} />;
}
