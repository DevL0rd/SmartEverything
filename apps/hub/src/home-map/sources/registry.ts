import {
  ApiError,
  type DeviceRow,
  type HomeMapSource,
  type HomeMapSourceGeometry,
} from '@smarteverything/domain';

export type MapSourceKind = HomeMapSource['kind'];

export interface MapSourceCapabilities {
  readonly rooms: boolean;
  readonly walls: boolean;
  readonly doors: boolean;
  readonly carpets: boolean;
  readonly furniture: boolean;
  readonly livePose: boolean;
  readonly zones: boolean;
}

export interface MapSourceChange {
  readonly deviceId: string;
  readonly version: string;
}

export type MapSourceListener = (change: MapSourceChange) => void;

export type SourceInventory = readonly Pick<DeviceRow, 'id' | 'provider' | 'model'>[];

export interface MapSource {
  readonly kind: MapSourceKind;
  readonly label: string;
  readonly capabilities: MapSourceCapabilities;
  devicesOf(inventory: SourceInventory): string[];
  read(deviceId: string): HomeMapSourceGeometry | null;
  onChange(deviceId: string, listener: MapSourceListener): () => void;
  isSettled(deviceId: string): boolean;
}

export interface SourceCandidate {
  readonly source: MapSource;
  readonly deviceId: string;
}

export class MapSourceRegistry {
  private readonly sources = new Map<MapSourceKind, MapSource>();

  constructor(sources: readonly MapSource[] = []) {
    for (const source of sources) this.register(source);
  }

  register(source: MapSource): void {
    if (this.sources.has(source.kind)) {
      throw new ApiError('internal', `The map source ${source.kind} is registered twice.`);
    }
    this.sources.set(source.kind, source);
  }

  get(kind: MapSourceKind): MapSource | undefined {
    return this.sources.get(kind);
  }

  list(): MapSource[] {
    return [...this.sources.values()];
  }

  candidates(inventory: SourceInventory): SourceCandidate[] {
    return this.list().flatMap((source) =>
      source.devicesOf(inventory).map((deviceId) => ({ source, deviceId })),
    );
  }
}
