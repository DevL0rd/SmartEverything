export const DEVICE_METRIC_TABLES: readonly string[] = [
  `create table device_metrics (
    device_id text not null references devices (id) on delete cascade,
    capability text not null check (length(capability) between 1 and 120),
    resolution text not null check (resolution in ('minute', 'hour')),
    bucket_start text not null,
    average real not null,
    minimum real not null,
    maximum real not null,
    count integer not null check (count > 0),
    primary key (device_id, capability, resolution, bucket_start)
  ) strict, without rowid`,
  'create index device_metrics_age on device_metrics (resolution, bucket_start)',
];
