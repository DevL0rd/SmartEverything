import { readFileSync } from 'node:fs';
import { VACUUM_SCENE, type VacuumScene } from '@smarteverything/domain';
import { vacuumRenderScene } from '../adapters/vacuum-scene';
import type { SceneInput } from './vacuum-geometry';

export const scrubbedScene: VacuumScene = VACUUM_SCENE.parse(
  JSON.parse(
    readFileSync(
      new URL(
        '../../../features/devices/vacuum/model/scene-geometry.fixture.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ),
);

export function vacuumInput(scene: VacuumScene): SceneInput {
  const rendered = vacuumRenderScene({ scene });
  const [floor] = rendered.floors;
  if (floor === undefined) throw new Error('The vacuum render scene has no floor');
  return { key: rendered.key, source: rendered.source, floor };
}
