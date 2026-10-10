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
import { flag } from '../sql';
import { windowFilter, type TimeWindow } from './window';

const STORED_CAMERA = storedRow(CAMERA_ROW, {
  flags: ['physical_ptz', 'two_way_audio', 'record_events', 'transcribe'],
});

const STORED_RECORDING = storedRow(RECORDING_ROW, {});

const CAMERA_COLUMNS =
  'device_id, stream_name, source_url_kind, physical_ptz, two_way_audio, record_events, wake_sensitivity, transcribe';

const RECORDING_COLUMNS =
  'id, device_id, event_id, kind, storage_path, started_at, duration_ms, bytes, created_at';

export interface NewRecording {
  readonly deviceId: string;
  readonly eventId: string | null;
  readonly kind: RecordingKind;
  readonly storagePath: string;
  readonly startedAt: string;
  readonly durationMs: number | null;
  readonly bytes: number;
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
        `update cameras set record_events = $record, wake_sensitivity = $sensitivity,
           transcribe = $transcribe where device_id = $deviceId`,
        {
          deviceId,
          record: flag(change.record_events ?? before.record_events),
          sensitivity: change.wake_sensitivity ?? before.wake_sensitivity,
          transcribe: flag(change.transcribe ?? before.transcribe),
        },
      );
      const after = this.byDevice(deviceId);
      this.context.changed('cameras', 'UPDATE', after, before);
      return after;
    });
  }

  recordings(window: TimeWindow): RecordingRow[] {
    const filter = windowFilter('started_at', window);
    return this.context.sql.all(
      STORED_RECORDING,
      `select ${RECORDING_COLUMNS} from recordings where ${filter.text}
       order by started_at desc, rowid desc limit $limit`,
      filter.parameters,
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
    return this.context.sql.all(
      STORED_RECORDING,
      `select ${RECORDING_COLUMNS} from recordings where event_id = $eventId`,
      { eventId },
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
