import { appendTo } from '@smarteverything/domain';
import { FACE_MATCH_THRESHOLD } from './models';

export interface ClusterFace {
  readonly id: string;
  readonly embedding: Float32Array;
  readonly quality: number;
  readonly groupId: string | null;
  readonly confirmed: boolean;
  readonly rejectedGroupIds: ReadonlySet<string>;
}

export interface ClusterGroup {
  readonly id: string;
  readonly centroid: Float32Array;
}

export interface Assignment {
  readonly groupId: string | null;
  readonly similarity: number;
}

export interface Cluster {
  readonly groupId: string | null;
  readonly faceIds: readonly string[];
}

export interface MergeSuggestion {
  readonly groupIds: readonly [string, string];
  readonly similarity: number;
}

export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    const x = a[index] ?? 0;
    const y = b[index] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  const norm = Math.sqrt(normA * normB);
  return norm === 0 ? 0 : dot / norm;
}

export function centroidOf(
  faces: readonly { readonly embedding: Float32Array; readonly quality: number }[],
): Float32Array {
  const [first] = faces;
  const sum = new Float32Array(first?.embedding.length ?? 0);
  const weighted = faces.some((face) => face.quality > 0);
  for (const face of faces) {
    const weight = weighted ? face.quality : 1;
    for (let index = 0; index < sum.length; index += 1)
      sum[index] = (sum[index] ?? 0) + weight * (face.embedding[index] ?? 0);
  }
  let norm = 0;
  for (const value of sum) norm += value * value;
  const length = Math.sqrt(norm);
  return length === 0 ? sum : sum.map((value) => value / length);
}

export function assignIncremental(
  embedding: Float32Array,
  groups: readonly ClusterGroup[],
  rejectedGroupIds: ReadonlySet<string>,
  threshold: number = FACE_MATCH_THRESHOLD,
): Assignment {
  let best: Assignment = { groupId: null, similarity: -1 };
  for (const group of groups) {
    if (rejectedGroupIds.has(group.id)) continue;
    const similarity = cosine(embedding, group.centroid);
    if (similarity >= threshold && similarity > best.similarity)
      best = { groupId: group.id, similarity };
  }
  return best;
}

export function mergeSuggestions(
  groups: readonly ClusterGroup[],
  dismissed: ReadonlySet<string>,
  threshold: number = FACE_MATCH_THRESHOLD,
): MergeSuggestion[] {
  const found: MergeSuggestion[] = [];
  for (let left = 0; left < groups.length; left += 1)
    for (let right = left + 1; right < groups.length; right += 1) {
      const a = groups[left];
      const b = groups[right];
      if (a === undefined || b === undefined) continue;
      const pair = a.id < b.id ? ([a.id, b.id] as const) : ([b.id, a.id] as const);
      if (dismissed.has(pairKey(pair[0], pair[1]))) continue;
      const similarity = cosine(a.centroid, b.centroid);
      if (similarity >= threshold) found.push({ groupIds: pair, similarity });
    }
  return found.toSorted((x, y) => y.similarity - x.similarity);
}

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

interface Edge {
  readonly to: number;
  readonly weight: number;
}

function isPinned(face: ClusterFace | undefined): face is ClusterFace & { groupId: string } {
  return face !== undefined && face.confirmed && face.groupId !== null;
}

function forbidden(a: ClusterFace, b: ClusterFace): boolean {
  if (a.confirmed && b.confirmed && a.groupId !== b.groupId) return true;
  if (isPinned(b) && a.rejectedGroupIds.has(b.groupId)) return true;
  return isPinned(a) && b.rejectedGroupIds.has(a.groupId);
}

function dotOf(flat: Float32Array, left: number, right: number, size: number): number {
  let dot = 0;
  for (let index = 0; index < size; index += 1)
    dot += (flat[left * size + index] ?? 0) * (flat[right * size + index] ?? 0);
  return dot;
}

function linkable(faces: readonly ClusterFace[], left: number, right: number): boolean {
  const a = faces[left];
  const b = faces[right];
  return a !== undefined && b !== undefined && !forbidden(a, b);
}

function neighbourGraph(faces: readonly ClusterFace[], threshold: number): Edge[][] {
  const size = faces[0]?.embedding.length ?? 0;
  const flat = new Float32Array(faces.length * size);
  faces.forEach((face, index) => {
    flat.set(face.embedding, index * size);
  });
  const edges: Edge[][] = faces.map(() => []);
  for (let left = 0; left < faces.length; left += 1)
    for (let right = left + 1; right < faces.length; right += 1) {
      if (!linkable(faces, left, right)) continue;
      const dot = dotOf(flat, left, right, size);
      if (dot < threshold) continue;
      edges[left]?.push({ to: right, weight: dot });
      edges[right]?.push({ to: left, weight: dot });
    }
  return edges;
}

function seededOrder(count: number, seed: number): number[] {
  const order = Array.from({ length: count }, (_, index) => index);
  let state = seed >>> 0 || 1;
  for (let index = count - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swap = state % (index + 1);
    const held = order[index];
    const other = order[swap];
    if (held !== undefined && other !== undefined) {
      order[index] = other;
      order[swap] = held;
    }
  }
  return order;
}

function labelFor(face: ClusterFace, index: number): string {
  return isPinned(face) ? `g:${face.groupId}` : `f:${String(index)}`;
}

function labelTotals(
  face: ClusterFace | undefined,
  edges: readonly Edge[],
  labels: readonly string[],
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const edge of edges) {
    const label = labels[edge.to];
    if (label === undefined) continue;
    if (label.startsWith('g:') && face?.rejectedGroupIds.has(label.slice(2)) === true) continue;
    totals.set(label, (totals.get(label) ?? 0) + edge.weight);
  }
  return totals;
}

function adopt(
  node: number,
  faces: readonly ClusterFace[],
  edges: readonly Edge[][],
  labels: readonly string[],
): string {
  const totals = labelTotals(faces[node], edges[node] ?? [], labels);
  let best = labels[node] ?? '';
  let bestWeight = totals.size === 0 ? 0 : -1;
  for (const [label, weight] of totals)
    if (weight > bestWeight || (weight === bestWeight && label < best)) {
      best = label;
      bestWeight = weight;
    }
  return best;
}

function propagate(
  faces: readonly ClusterFace[],
  edges: readonly Edge[][],
  seed: number,
): string[] {
  const labels = faces.map(labelFor);
  const order = seededOrder(faces.length, seed);
  const seen = new Set<string>();
  for (;;) {
    for (const node of order) {
      if (isPinned(faces[node])) continue;
      labels[node] = adopt(node, faces, edges, labels);
    }
    const state = labels.join('\n');
    if (seen.has(state)) return labels;
    seen.add(state);
  }
}

interface Overlap {
  readonly label: string;
  readonly groupId: string;
  readonly count: number;
}

function overlapsOf(
  label: string,
  nodes: readonly number[],
  faces: readonly ClusterFace[],
): Overlap[] {
  const counts = new Map<string, number>();
  for (const node of nodes) {
    const groupId = faces[node]?.groupId ?? null;
    if (groupId !== null) counts.set(groupId, (counts.get(groupId) ?? 0) + 1);
  }
  return [...counts].map(([groupId, count]) => ({ label, groupId, count }));
}

function rejects(
  nodes: readonly number[],
  faces: readonly ClusterFace[],
  groupId: string,
): boolean {
  return nodes.some((node) => faces[node]?.rejectedGroupIds.has(groupId) === true);
}

function claimGroups(
  members: ReadonlyMap<string, readonly number[]>,
  faces: readonly ClusterFace[],
): Map<string, string> {
  const claims = new Map<string, string>();
  const taken = new Set<string>();
  const overlaps: Overlap[] = [];
  for (const [label, nodes] of members) {
    if (label.startsWith('g:')) {
      claims.set(label, label.slice(2));
      taken.add(label.slice(2));
    } else overlaps.push(...overlapsOf(label, nodes, faces));
  }
  overlaps.sort((a, b) => b.count - a.count || (a.groupId < b.groupId ? -1 : 1));
  for (const overlap of overlaps) {
    if (claims.has(overlap.label) || taken.has(overlap.groupId)) continue;
    if (rejects(members.get(overlap.label) ?? [], faces, overlap.groupId)) continue;
    claims.set(overlap.label, overlap.groupId);
    taken.add(overlap.groupId);
  }
  return claims;
}

export function recluster(
  faces: readonly ClusterFace[],
  options: { readonly threshold?: number; readonly seed?: number } = {},
): Cluster[] {
  const edges = neighbourGraph(faces, options.threshold ?? FACE_MATCH_THRESHOLD);
  const labels = propagate(faces, edges, options.seed ?? 1);
  const members = new Map<string, number[]>();
  labels.forEach((label, node) => {
    appendTo(members, label, node);
  });
  const claims = claimGroups(members, faces);
  return [...members].map(([label, nodes]) => ({
    groupId: claims.get(label) ?? null,
    faceIds: nodes.flatMap((node) => {
      const id = faces[node]?.id;
      return id === undefined ? [] : [id];
    }),
  }));
}
