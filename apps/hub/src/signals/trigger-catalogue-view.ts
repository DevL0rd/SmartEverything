import {
  rowSentence,
  searchTriggerCatalogue,
  type DeviceScope,
  type ResponseOf,
  type TriggerCatalogueQuery,
  type TriggerRow,
} from '@smarteverything/domain';
import { triggerCatalogueOf, type CatalogueStore } from './trigger-catalogue-of';

type CatalogueView = ResponseOf<'listTriggerCatalogue'>;

function rowView(row: TriggerRow, sentence: string): CatalogueView['rows'][number] {
  return {
    source: row.source,
    kind: row.kind,
    label: row.label,
    group: row.group,
    subject: row.subject,
    field: row.field,
    room: row.room,
    how: [...row.hows],
    fields: row.fields.map((field) => field.field),
    match: row.match.map((entry) => entry.key),
    sentence,
  };
}

export function triggerCatalogueView(
  store: CatalogueStore,
  scope: DeviceScope | null,
  query: TriggerCatalogueQuery,
): CatalogueView {
  const catalogue = triggerCatalogueOf(store, scope);
  const found = searchTriggerCatalogue(catalogue, query);
  return {
    total: found.length,
    rows: found.slice(0, query.limit).map((row) => rowView(row, rowSentence(row, catalogue))),
  };
}
