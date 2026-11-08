import type { Migration } from './migration';

export const IMAGE_FALLBACK_ORDER_DROP_MIGRATION: Migration = {
  version: 157,
  name: 'image-fallback-order-drop',
  statements: [
    `update assistant_settings set settings = json_remove(settings, '$.image_fallback_order') where json_type(settings, '$.image_fallback_order') is not null`,
  ],
};
