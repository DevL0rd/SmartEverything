import type { Migration } from './migration';

export const ANDROID_BUILD_OBSERVATIONS_MIGRATION: Migration = {
  version: 169,
  name: 'android-build-observations',
  statements: [
    `create table android_build_observations (
      client_id text primary key references clients (id) on delete cascade,
      build text not null check (json_valid(build)),
      observed_at text not null
    ) strict`,
    `create trigger android_build_pairing_changed
      after update of token_hash, profile_id on clients
      when old.token_hash is not new.token_hash or old.profile_id is not new.profile_id
      begin
        delete from android_build_observations where client_id = new.id;
      end`,
  ],
};
