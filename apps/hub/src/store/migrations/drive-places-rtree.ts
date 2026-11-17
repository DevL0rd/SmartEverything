import type { Migration } from './migration';

export const DRIVE_PLACES_RTREE_MIGRATION: Migration = {
  version: 238,
  name: 'drive-places-rtree',
  statements: [
    'create virtual table drive_places_rt using rtree(rid, minlat, maxlat, minlon, maxlon)',
    'insert into drive_places_rt (rid, minlat, maxlat, minlon, maxlon) select rowid, lat, lat, lon, lon from drive_places',
    `create trigger drive_places_rt_insert after insert on drive_places begin
       insert into drive_places_rt (rid, minlat, maxlat, minlon, maxlon) values (new.rowid, new.lat, new.lat, new.lon, new.lon);
     end`,
    `create trigger drive_places_rt_update after update of lat, lon on drive_places begin
       update drive_places_rt set minlat = new.lat, maxlat = new.lat, minlon = new.lon, maxlon = new.lon
       where rid = new.rowid;
     end`,
    `create trigger drive_places_rt_delete after delete on drive_places begin
       delete from drive_places_rt where rid = old.rowid;
     end`,
  ],
};
