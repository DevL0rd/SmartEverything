export interface SceneQualityTarget {
  readonly triangles: number;
  readonly drawCalls: number;
}

export const VACUUM_QUALITY_TARGET: SceneQualityTarget = { triangles: 60_000, drawCalls: 20 };
