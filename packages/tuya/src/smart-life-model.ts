import { z } from 'zod';
import { IDENTITY_CONVERSION, isKnownConversion, type DataPointConversion } from './conversions';
import type { PointSource, PointSources, RejectedDataPoint } from './data-points';
import { JSON_TEXT } from './json-text';
import type { DataPointRelations, SmartLifeSpecification } from './smart-life-api';

const STATUS_FORMAT = JSON_TEXT.pipe(z.record(z.string(), z.unknown()));

type Relation = DataPointRelations['dpStatusRelationDTOS'][number];

export type CloudReports = 'data_points' | 'codes';

export const CLOUD_REPORT_REASONS = [
  'all_data_points_local',
  'custom_code_type',
  'data_point_not_local',
  'no_data_points',
  'specification_unpublished',
] as const;

export type CloudReportReason = (typeof CLOUD_REPORT_REASONS)[number];

export type GatewaySource = 'device_list' | 'shared_local_key';

export type NodeIdSource = 'device_list' | 'uuid';

export interface SmartLifeFacts {
  readonly conversions: ReadonlyMap<number, DataPointConversion>;
  readonly cloudReports: CloudReports;
  readonly cloudReportReason: CloudReportReason;
  readonly gatewayFrom: GatewaySource | null;
  readonly nodeIdFrom: NodeIdSource | null;
}

export interface SmartLifeModel {
  readonly sources: PointSources;
  readonly conversions: ReadonlyMap<number, DataPointConversion>;
  readonly rejected: readonly RejectedDataPoint[];
  readonly cloudReports: CloudReports;
  readonly cloudReportReason: CloudReportReason;
}

function statusCodeOf(relation: Relation): string | null {
  const parsed = STATUS_FORMAT.safeParse(relation.statusFormat);
  return parsed.success ? (Object.keys(parsed.data).at(-1) ?? null) : null;
}

interface ReadRelations {
  readonly conversions: Map<number, DataPointConversion>;
  readonly rejected: RejectedDataPoint[];
}

function conversionsOf(relations: DataPointRelations): ReadRelations {
  const read: ReadRelations = { conversions: new Map(), rejected: [] };
  for (const relation of relations.dpStatusRelationDTOS) {
    const code = statusCodeOf(relation);
    if (code === null) {
      read.rejected.push({
        code: `dp_${String(relation.dpId)}`,
        reason: 'Tuya gave it no Smart Life code in statusFormat',
      });
    } else if (isKnownConversion(relation.valueConvert)) {
      read.conversions.set(relation.dpId, {
        name: relation.valueConvert,
        dpId: relation.dpId,
        code,
        valueType: relation.valueType,
        valueDesc: relation.valueDesc,
        enumMappings: relation.enumMappingMap,
      });
    } else {
      read.rejected.push({
        code,
        reason: `Tuya converts it with "${relation.valueConvert}", which the Smart Life SDK does not define`,
      });
    }
  }
  return read;
}

function withDataPoints(
  items: SmartLifeSpecification['functions'],
  conversions: ReadonlyMap<number, DataPointConversion>,
): PointSource[] {
  const ids = new Map(
    [...conversions.values()].map((conversion) => [conversion.code, conversion.dpId]),
  );
  return items.map((item) => ({ ...item, dp_id: ids.get(item.code) ?? null }));
}

function cloudReportsOf(relations: DataPointRelations, customType: boolean): CloudReportReason {
  if (customType) {
    return 'custom_code_type';
  }
  if (relations.dpStatusRelationDTOS.length === 0) {
    return 'no_data_points';
  }
  return relations.dpStatusRelationDTOS.every((relation) => relation.supportLocal)
    ? 'all_data_points_local'
    : 'data_point_not_local';
}

export function smartLifeModel(
  specification: SmartLifeSpecification,
  relations: DataPointRelations,
  customType: boolean,
): SmartLifeModel {
  const { conversions, rejected } = conversionsOf(relations);
  const reason = cloudReportsOf(relations, customType);
  return {
    sources: {
      functions: withDataPoints(specification.functions, conversions),
      status: withDataPoints(specification.status, conversions),
    },
    conversions,
    rejected,
    cloudReports: reason === 'all_data_points_local' ? 'data_points' : 'codes',
    cloudReportReason: reason,
  };
}

export function isLanWritable(
  conversions: ReadonlyMap<number, DataPointConversion>,
  dpId: number | null,
): dpId is number {
  return dpId !== null && conversions.get(dpId)?.name === IDENTITY_CONVERSION;
}
