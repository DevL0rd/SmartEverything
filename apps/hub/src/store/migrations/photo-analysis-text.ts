import type { Migration } from './migration';

export const PHOTO_ANALYSIS_TEXT_MIGRATION: Migration = {
  version: 232,
  name: 'photo-analysis-text',
  statements: [
    'alter table photo_analysis add column text text check (text is null or length(trim(text)) > 0)',
  ],
};
