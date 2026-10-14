export const BLE_OBSERVATION_TABLES = [
  `create table ble_observation_cursors (
    device_id text not null references devices(id) on delete cascade,
    key_epoch text not null,
    counter integer not null,
    frame_hash text not null,
    seen_at text not null,
    received_at text not null,
    primary key (device_id, key_epoch)
  )`,
] as const;
