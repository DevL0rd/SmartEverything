import type { Migration } from './migration';

export const PHOTO_VISION_REFUSED_RETRY_MIGRATION: Migration = {
  version: 225,
  name: 'photo-vision-refused-retry',
  statements: [
    `delete from drive_media_jobs where kind = 'vision' and state = 'failed'`,
    `delete from photo_analysis where state = 'failed'`,
  ],
};
