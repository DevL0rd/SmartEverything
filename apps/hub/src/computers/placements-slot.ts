import type { DrivePlacements } from '../drive/placements';

export type SessionPlacementSource = Pick<
  DrivePlacements,
  'activeFor' | 'onDeviceChanged' | 'writeStatus'
>;

export class DrivePlacementsNotStartedError extends Error {
  override readonly name = 'DrivePlacementsNotStartedError';

  constructor() {
    super('A computer asked for its drive placements before the drive finished starting.');
  }
}

export class ComputerPlacementsSlot implements SessionPlacementSource {
  private source: SessionPlacementSource | null = null;

  attach(source: SessionPlacementSource): void {
    this.source = source;
  }

  activeFor: SessionPlacementSource['activeFor'] = (deviceId) => this.started().activeFor(deviceId);

  onDeviceChanged: SessionPlacementSource['onDeviceChanged'] = (listener) =>
    this.started().onDeviceChanged(listener);

  writeStatus: SessionPlacementSource['writeStatus'] = (deviceId, placementId, status) =>
    this.started().writeStatus(deviceId, placementId, status);

  private started(): SessionPlacementSource {
    if (this.source === null) throw new DrivePlacementsNotStartedError();
    return this.source;
  }
}
