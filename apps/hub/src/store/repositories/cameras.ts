import {
  CAMERA_ROW,
  RECORDING_ROW,
  type CameraChange,
  type CameraRow,
  type RecordingKind,
  type RecordingRow,
} from '@smarteverything/domain';
import type { CameraUpsert } from '../../database/port';
import { storedRow } from '../codec';
import { found, moment, type StoreContext } from '../context';
import { flag, inList } from '../sql';
import { windowFilter, type TimeWindow } from './window';

const STORED_CAMERA = storedRow(CAMERA_ROW, {
  flags: ['physical_ptz', 'two_way_audio', 'record_events', 'transcribe'],
});

const STORED_RECORDING = storedRow(RECORDING_ROW, {});

const CAMERA_COLUMNS =
  'device_id, stream_name, source_url_kind, physical_ptz, two_way_audio, record_events, keep_days, wake_sensitivity, transcribe';

const RECORDING_COLUMNS =
  'id, device_id, event_id, kind, storage_path, started_at, duration_ms, bytes, created_at';

const EXPIRED_RECORDING_IDS = `select recordings.id from recordings
  join cameras on cameras.device_id = recordings.device_id
  where recordings.created_at < strftime('%Y-%m-%dT%H:%M:%fZ', $now, '-' || cameras.keep_days || ' days')`;

export interface NewRecording {
  readonly deviceId: string;
  readonly eventId: string | null;
  readonly kind: RecordingKind;
  readonly storagePath: string;
  readonly startedAt: string;
  readonly durationMs: number | null;
  readonly bytes: number;
}

export interface RecordingWindow extends TimeWindow {
  readonly kind?: RecordingKind | undefined;
}

function sameStream(row: CameraRow, camera: CameraUpsert): boolean {
  return (
    row.stream_name === camera.streamName &&
    row.source_url_kind === camera.sourceUrlKind &&
    row.physical_ptz === camera.physicalPtz &&
    row.two_way_audio === camera.twoWayAudio
  );
}

export class CamerasRepository {
  constructor(private readonly context: StoreContext) {}

  list(): CameraRow[] {
    return this.context.sql.all(
      STORED_CAMERA,
      `select ${CAMERA_COLUMNS} from cameras order by device_id`,
    );
  }

  byDevice(deviceId: string): CameraRow {
    return found(this.find(deviceId), 'camera', deviceId);
  }

  upsert(cameras: readonly CameraUpsert[]): void {
    this.context.write(() => {
      for (const camera of cameras) {
        const before = this.find(camera.deviceId);
        if (before !== undefined && sameStream(before, camera)) {
          continue;
        }
        this.context.sql.run(
          'save the camera',
          `insert into cameras (device_id, stream_name, source_url_kind, physical_ptz, two_way_audio)
           values ($deviceId, $streamName, $kind, $ptz, $audio)
           on conflict (device_id) do update set stream_name = excluded.stream_name,
             source_url_kind = excluded.source_url_kind, physical_ptz = excluded.physical_ptz,
             two_way_audio = excluded.two_way_audio`,
          {
            deviceId: camera.deviceId,
            streamName: camera.streamName,
            kind: camera.sourceUrlKind,
            ptz: flag(camera.physicalPtz),
            audio: flag(camera.twoWayAudio),
          },
        );
        this.context.changed(
          'cameras',
          before === undefined ? 'INSERT' : 'UPDATE',
          this.byDevice(camera.deviceId),
          before ?? null,
        );
      }
    });
  }

  change(deviceId: string, change: CameraChange): CameraRow {
    return this.context.write(() => {
      const before = this.byDevice(deviceId);
      this.context.sql.run(
        'change the camera',
        `update cameras set record_events = $record, keep_days = $keepDays,
           wake_sensitivity = $sensitivity, transcribe = $transcribe where device_id = $deviceId`,
        {
          deviceId,
          record: flag(change.record_events ?? before.record_events),
          keepDays: change.keep_days ?? before.keep_days,
          sensitivity: change.wake_sensitivity ?? before.wake_sensitivity,
          transcribe: flag(change.transcribe ?? before.transcribe),
        },
      );
      const after = this.byDevice(deviceId);
      this.context.changed('cameras', 'UPDATE', after, before);
      return after;
    });
  }

  recordings(window: RecordingWindow): RecordingRow[] {
    const filter = windowFilter('started_at', window);
    const kind = window.kind === undefined ? '' : ' and kind = $kind';
    return this.context.sql.all(
      STORED_RECORDING,
      `select ${RECORDING_COLUMNS} from recordings where ${filter.text}${kind}
       order by started_at desc, rowid desc limit $limit`,
      window.kind === undefined ? filter.parameters : { ...filter.parameters, kind: window.kind },
    );
  }

  recording(id: string): RecordingRow {
    return found(
      this.context.sql.get(
        STORED_RECORDING,
        `select ${RECORDING_COLUMNS} from recordings where id = $id`,
        { id },
      ),
      'recording',
      id,
    );
  }

  recordingsOfEvent(eventId: string): RecordingRow[] {
    return this.recordingsOfEvents([eventId]);
  }

  recordingsOfEvents(eventIds: readonly string[]): RecordingRow[] {
    if (eventIds.length === 0) {
      return [];
    }
    const filter = inList('event_id', 'events', eventIds);
    return this.context.sql.all(
      STORED_RECORDING,
      `select ${RECORDING_COLUMNS} from recordings where ${filter.text} order by rowid`,
      filter.parameters,
    );
  }

  addRecording(recording: NewRecording): RecordingRow {
    return this.context.write(() => {
      const id = this.context.newId();
      this.context.sql.run(
        'add the recording',
        `insert into recordings (id, device_id, event_id, kind, storage_path, started_at, duration_ms, bytes, created_at)
         values ($id, $deviceId, $eventId, $kind, $path, $startedAt, $durationMs, $bytes, $now)`,
        {
          id,
          deviceId: recording.deviceId,
          eventId: recording.eventId,
          kind: recording.kind,
          path: recording.storagePath,
          startedAt: moment(recording.startedAt),
          durationMs: recording.durationMs,
          bytes: recording.bytes,
          now: this.context.now(),
        },
      );
      const row = this.recording(id);
      this.context.changed('recordings', 'INSERT', row, null);
      return row;
    });
  }

  removeExpiredRecordings(now: Date): RecordingRow[] {
    return this.context.write(() => {
      const parameters = { now: now.toISOString() };
      const expired = this.context.sql.all(
        STORED_RECORDING,
        `select ${RECORDING_COLUMNS} from recordings where id in (${EXPIRED_RECORDING_IDS})
         order by created_at, rowid`,
        parameters,
      );
      this.context.sql.run(
        'remove the expired recordings',
        `delete from recordings where id in (${EXPIRED_RECORDING_IDS})`,
        parameters,
      );
      for (const recording of expired) {
        this.context.changed('recordings', 'DELETE', null, recording);
      }
      return expired;
    });
  }

  removeRecording(id: string): RecordingRow {
    return this.context.write(() => {
      const before = this.recording(id);
      this.context.sql.run('remove the recording', 'delete from recordings where id = $id', { id });
      this.context.changed('recordings', 'DELETE', null, before);
      return before;
    });
  }

  find(deviceId: string): CameraRow | undefined {
    return this.context.sql.get(
      STORED_CAMERA,
      `select ${CAMERA_COLUMNS} from cameras where device_id = $deviceId`,
      { deviceId },
    );
  }
}
