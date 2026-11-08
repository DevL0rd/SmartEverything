import { homeMapEditInner, homeMapEditLimits } from '@smarteverything/domain/home-map-edit-core';
import type { HomeMapWallAttachment } from '@smarteverything/domain/home-map-elements';
import { modelSizeParams } from '@smarteverything/domain/model-placement';
import { MODEL_SPEC, type ModelSpec } from '@smarteverything/domain/model-spec';
import { Group } from 'three';
import { z } from 'zod';
import type { RenderFloor, RenderObject, RenderPlacement, RenderPoint } from '../render-scene';
import type { StructureTheme } from './floor-looks';
import { sizedModel } from '../../models/three/sized-model';
import {
  deviceBoxesOf,
  nodePrism,
  objectBoxesOf,
  type ObjectPickBox,
  type PickBox,
  type PickPrism,
} from './render-core-pick';
import { deviceKey, objectKey } from './scene-object-boxes';
import {
  buildSceneObjects,
  type SceneObjectItem,
  type SceneObjectLabel,
  type SceneObjectLod,
  type SceneObjectModel,
  type SceneObjectModelSet,
  type SceneObjectModelSetup,
  type SceneObjects,
  type SceneObjectsFloor,
  type ScenePosed,
} from './scene-objects';

export interface ObjectModels {
  readonly specOf: (modelId: string) => ModelSpec | undefined;
  readonly deviceSpecOf: (placement: RenderPlacement) => ModelSpec | undefined;
}

export const SCENE_MODELS = z.strictObject({
  specs: z.array(MODEL_SPEC),
  devices: z.record(z.string(), z.string()),
});

export interface SceneModelsWire {
  readonly specs: readonly ModelSpec[];
  readonly devices: Readonly<Record<string, string>>;
}

export function objectModelsOf(wire: SceneModelsWire): ObjectModels {
  const specs = new Map(wire.specs.map((spec) => [spec.id, spec]));
  return {
    specOf: (modelId) => specs.get(modelId),
    deviceSpecOf: (placement): ModelSpec | undefined => {
      const modelId = wire.devices[placement.deviceId];
      return modelId === undefined ? undefined : specs.get(modelId);
    },
  };
}

export interface ObjectLook {
  readonly showFurniture: boolean;
  readonly showDeviceModels: boolean;
}

export const SHOW_ALL_OBJECTS: ObjectLook = { showFurniture: true, showDeviceModels: true };

export const FULL_DETAIL_LOD: SceneObjectLod = 2;

export function lodForBias(lodBias: number): SceneObjectLod {
  const level = FULL_DETAIL_LOD - Math.max(0, Math.round(lodBias));
  if (level >= 2) return 2;
  return level === 1 ? 1 : 0;
}

export interface ObjectsLayerOptions<M extends SceneObjectModel> {
  readonly createModelSet: (setup: SceneObjectModelSetup) => SceneObjectModelSet<M>;
  readonly onChange: () => void;
}

interface Shown {
  readonly floor: RenderFloor;
  readonly theme: StructureTheme;
}

function groundFloor(floor: RenderFloor, look: ObjectLook): SceneObjectsFloor {
  return {
    id: floor.id,
    elevation: 0,
    walls: floor.walls,
    objects: look.showFurniture ? floor.objects : [],
    placements: look.showDeviceModels ? floor.placements : [],
  };
}

export interface PreviewSize {
  readonly w: number;
  readonly d: number;
  readonly h: number | null;
}

export interface ObjectPose {
  readonly at: RenderPoint;
  readonly rotationDeg: number;
  readonly height: number;
  readonly wall: HomeMapWallAttachment | null;
  readonly size: PreviewSize | null;
}

export interface ObjectPreview {
  readonly id: string;
  readonly pose: ObjectPose | null;
  readonly lift: number;
}

function sizedParams(
  params: Readonly<Record<string, number>>,
  size: PreviewSize | null,
  spec: ModelSpec | undefined,
): Readonly<Record<string, number>> {
  if (size === null || spec === undefined) return params;
  const limits = homeMapEditLimits({ sizeParams: modelSizeParams(spec), presets: [] });
  const sized = { ...params };
  for (const [limit, value] of [
    [limits.w, size.w],
    [limits.d, size.d],
    [limits.h, size.h],
  ] as const) {
    if (limit !== null && value !== null) sized[limit.name] = homeMapEditInner(limit, value);
  }
  return sized;
}

function posedObject(
  item: RenderObject,
  preview: ObjectPreview,
  models: ObjectModels,
): RenderObject {
  const { pose, lift } = preview;
  const spec = item.modelId === null ? undefined : models.specOf(item.modelId);
  const posed =
    pose === null
      ? item
      : {
          ...item,
          at: pose.at,
          rotationDeg: pose.rotationDeg,
          elevation: pose.height,
          wall: pose.wall,
          params: sizedParams(item.params, pose.size, spec),
        };
  return { ...posed, elevation: posed.elevation + lift };
}

function posedDevice(item: RenderPlacement, preview: ObjectPreview): RenderPlacement {
  const { pose, lift } = preview;
  const posed =
    pose === null
      ? item
      : {
          ...item,
          at: pose.at,
          rotationDeg: pose.rotationDeg,
          height: pose.height,
          wall: pose.wall,
        };
  return { ...posed, height: posed.height + lift };
}

function posedOf(
  floor: RenderFloor,
  preview: ObjectPreview,
  models: ObjectModels,
): ScenePosed | null {
  const object = floor.objects.find((each) => each.id === preview.id);
  if (object !== undefined) return { kind: 'object', item: posedObject(object, preview, models) };
  const placement = floor.placements.find((each) => each.deviceId === preview.id);
  return placement === undefined ? null : { kind: 'device', item: posedDevice(placement, preview) };
}

export interface ObjectsHook {
  readonly setFloor: (floor: RenderFloor, theme: StructureTheme) => void;
  readonly setModels: (models: ObjectModels | null) => void;
  readonly setLook: (look: ObjectLook) => void;
  readonly setLodBias: (lodBias: number) => void;
  readonly select: (key: string | null) => void;
}

export class ObjectsLayer<M extends SceneObjectModel> implements ObjectsHook {
  readonly group = new Group();
  private shown: Shown | null = null;
  private models: ObjectModels | null = null;
  private look: ObjectLook = SHOW_ALL_OBJECTS;
  private lod: SceneObjectLod = FULL_DETAIL_LOD;
  private selected: string | null = null;
  private previews: readonly ObjectPreview[] = [];
  private built: SceneObjects<M> | null = null;

  constructor(private readonly options: ObjectsLayerOptions<M>) {
    this.group.name = 'objects-layer';
  }

  setFloor(floor: RenderFloor, theme: StructureTheme): void {
    if (this.shown?.floor === floor && this.shown.theme === theme) return;
    this.shown = { floor, theme };
    this.rebuild();
  }

  setModels(models: ObjectModels | null): void {
    if (this.models === models) return;
    this.models = models;
    this.rebuild();
  }

  setLook(look: ObjectLook): void {
    const { showFurniture, showDeviceModels } = this.look;
    if (look.showFurniture === showFurniture && look.showDeviceModels === showDeviceModels) return;
    this.look = look;
    this.rebuild();
  }

  setLodBias(lodBias: number): void {
    const lod = lodForBias(lodBias);
    if (lod === this.lod) return;
    this.lod = lod;
    this.built?.refreshLevels();
    this.options.onChange();
  }

  select(key: string | null): void {
    if (key === this.selected) return;
    this.selected = key;
    this.built?.select(key);
    this.options.onChange();
  }

  preview(previews: readonly ObjectPreview[]): void {
    if (previews.length === 0 && this.previews.length === 0) return;
    this.previews = previews;
    this.applyPreviews();
    this.options.onChange();
  }

  labels(): readonly SceneObjectLabel[] {
    return this.built?.labels ?? [];
  }

  item(key: string): SceneObjectItem<M> | undefined {
    return this.built?.item(key);
  }

  deviceBoxes(): readonly PickBox[] {
    const { shown, built, models } = this;
    if (shown === null || built === null || models === null || !this.look.showDeviceModels) {
      return [];
    }
    return deviceBoxesOf(shown.floor, (placement) =>
      this.modelPrism(deviceKey(placement.deviceId), models.deviceSpecOf(placement), {}),
    );
  }

  objectBoxes(): readonly ObjectPickBox[] {
    const { shown, built, models } = this;
    if (shown === null || built === null || models === null || !this.look.showFurniture) {
      return [];
    }
    return objectBoxesOf(shown.floor.objects, (item) =>
      this.modelPrism(
        objectKey(item.id),
        item.modelId === null ? undefined : models.specOf(item.modelId),
        item.params,
      ),
    );
  }

  dispose(): void {
    this.release();
    this.shown = null;
  }

  private modelPrism(
    key: string,
    spec: ModelSpec | undefined,
    params: Readonly<Record<string, number>>,
  ): PickPrism | null {
    const model = this.built?.item(key)?.model ?? null;
    if (model === null || spec === undefined) return null;
    return nodePrism(model.object3d, sizedModel(spec, params).size);
  }

  private applyPreviews(): void {
    const { shown, built, models } = this;
    if (shown === null || built === null || models === null) return;
    built.pose(this.previews.flatMap((preview) => posedOf(shown.floor, preview, models) ?? []));
  }

  private release(): void {
    this.built?.dispose();
    this.built = null;
  }

  private rebuild(): void {
    this.release();
    const { shown, models } = this;
    if (shown !== null && models !== null) {
      this.built = buildSceneObjects<M>({
        createModelSet: this.options.createModelSet,
        floors: [groundFloor(shown.floor, this.look)],
        specOf: models.specOf,
        deviceSpecOf: models.deviceSpecOf,
        theme: shown.theme,
        selectedKey: this.selected,
        lodOf: () => this.lod,
      });
      this.group.add(this.built.root);
      if (this.previews.length > 0) this.applyPreviews();
    }
    this.options.onChange();
  }
}

export function objectsLayerOf<M extends SceneObjectModel>(
  createModelSet: ObjectsLayerOptions<M>['createModelSet'] | undefined,
  onChange: () => void,
): ObjectsLayer<M> | null {
  return createModelSet === undefined ? null : new ObjectsLayer({ createModelSet, onChange });
}
