import type { Migration } from './migration';

export const PLANNER_BOOKING_PAGE_MIGRATION: Migration = {
  version: 219,
  name: 'planner-booking-page',
  statements: [
    `alter table planner_items add column booking_page_id text
      references planner_booking_pages (id) on delete set null`,
    `update planner_items set booking_page_id = (
       select page.id from planner_booking_pages page
       where page.profile_id = planner_items.profile_id
         and page.collection_id = planner_items.collection_id
         and substr(planner_items.title, 1, length(page.title) + 2) = page.title || ': '
       order by page.created_at, page.id
       limit 1
     )
     where created_by = 'booking'`,
    'create index planner_items_by_booking_page on planner_items (booking_page_id) where booking_page_id is not null',
  ],
};
