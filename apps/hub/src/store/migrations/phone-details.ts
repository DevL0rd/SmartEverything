export const PHONE_DETAIL_STATEMENTS: readonly string[] = [
  `create table phone_details (
    device_id text primary key references devices (id) on delete cascade,
    power text check (power is null or json_valid(power)),
    sound text check (sound is null or json_valid(sound)),
    screen text check (screen is null or json_valid(screen)),
    network text check (network is null or json_valid(network)),
    connections text check (connections is null or json_valid(connections)),
    storage text check (storage is null or json_valid(storage)),
    apps text check (apps is null or json_valid(apps)),
    notifications text check (notifications is null or json_valid(notifications)),
    alarm text check (alarm is null or json_valid(alarm))
  ) strict`,
  `create table phone_icons (
    hash text primary key check (length(hash) = 64),
    webp blob not null,
    created_at text not null
  ) strict`,
];
