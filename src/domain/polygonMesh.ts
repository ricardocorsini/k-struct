import { ShapeUtils, Vector2 } from "three";
import { checkMeshBudget, targetAt } from "./slabSizing";
import type { PolygonSlab, SlabSizing } from "./model";
import type { SlabMesh, SlabNode } from "./slab";
import {
  cross2,
  footprintProperties,
  nextIndex,
  type SlabRing,
  type XY,
} from "./slabPolygon";

type Triangle = [number, number, number];
const sideKey = (a: number, b: number) => (a < b ? `${a}/${b}` : `${b}/${a}`);

// Earcut may bridge a hole along a line containing another boundary vertex.
// Split both sides of every such edge before subdivision to keep matching nodes.
export function conformingTriangles(rings: SlabRing[], vertices: XY[]) {
  const paths = rings.map((ring) => ring.map((v) => new Vector2(v.x, v.y)));
  const pending = ShapeUtils.triangulateShape(
    paths[0],
    paths.slice(1),
  ) as Triangle[];
  const triangles: Triangle[] = [];
  while (pending.length) {
    const face = pending.pop()!;
    let split = false;
    for (let side = 0; side < 3 && !split; side++) {
      const ia = face[side],
        ib = face[(side + 1) % 3],
        ic = face[(side + 2) % 3];
      const a = vertices[ia],
        b = vertices[ib],
        dx = b.x - a.x,
        dy = b.y - a.y;
      for (const [k, p] of vertices.entries()) {
        if (face.includes(k)) continue;
        const cross = cross2(a, b, p);
        const roundoff =
          8 *
          Number.EPSILON *
          (Math.abs(dx * (p.y - a.y)) + Math.abs(dy * (p.x - a.x)));
        if (
          Math.abs(cross) > roundoff ||
          (p.x - a.x) * (p.x - b.x) + (p.y - a.y) * (p.y - b.y) >= 0
        )
          continue;
        pending.push([ia, k, ic], [k, ib, ic]);
        split = true;
        break;
      }
    }
    if (!split) {
      const [a, b, c] = face;
      const orientation = cross2(vertices[a], vertices[b], vertices[c]);
      if (!orientation)
        throw new Error("A triangulação produziu um elemento com área nula.");
      triangles.push(orientation > 0 ? face : [a, c, b]);
    }
  }
  return triangles;
}

export function meshPolygon(
  polygon: PolygonSlab["polygon"],
  z: number,
  sizing?: SlabSizing,
): SlabMesh {
  const { rings, refinements } = polygon;
  const vertices = rings.flat();
  const nodes: SlabNode[] = vertices.map(({ x, y }, i) => ({
    x,
    y,
    z,
    number: i + 1,
    restraints: [],
  }));
  let triangles = conformingTriangles(rings, vertices).map(
    ([a, b, c]): Triangle => [a + 1, b + 1, c + 1],
  );
  const edges: SlabMesh["edges"] = Object.create(null);
  let offset = 1;
  for (const ring of rings) {
    for (const [i, a] of ring.entries())
      edges[a.edgeId] = [offset + i, offset + nextIndex(i, ring.length)];
    offset += ring.length;
  }
  const incidence = new Map<string, number>();
  let area = 0;
  for (const face of triangles) {
    const [a, b, c] = face.map((i) => nodes[i - 1]);
    area += cross2(a, b, c) / 2;
    for (const [i, n] of face.entries()) {
      const key = sideKey(n, face[(i + 1) % 3]);
      incidence.set(key, (incidence.get(key) ?? 0) + 1);
    }
  }
  const boundaries = new Set(
    Object.values(edges).map(([a, b]) => sideKey(a, b)),
  );
  const expected = footprintProperties(rings).area;
  if (
    Math.abs(area - expected) > 1e-9 * expected ||
    [...boundaries].some((key) => incidence.get(key) !== 1) ||
    [...incidence].some(([key, n]) => n !== (boundaries.has(key) ? 1 : 2))
  )
    throw new Error(
      "A triangulação não cobre a área líquida ou não preserva uma borda do painel.",
    );

  if (sizing)
    checkMeshBudget(expected / ((Math.sqrt(3) / 4) * sizing.target ** 2));
  const localTarget = sizing ? targetAt(rings, sizing) : null;
  for (let level = 0; localTarget || level < refinements; level++) {
    const marked = new Set<string>();
    for (const face of triangles)
      for (const [i, a] of face.entries()) {
        const b = face[(i + 1) % 3],
          key = sideKey(a, b);
        if (marked.has(key)) continue;
        const u = nodes[a - 1],
          v = nodes[b - 1];
        if (
          !localTarget ||
          Math.hypot(v.x - u.x, v.y - u.y) >
            localTarget({
              x: u.x + (v.x - u.x) / 2,
              y: u.y + (v.y - u.y) / 2,
            }) *
              (1 + 1e-12)
        )
          marked.add(key);
      }
    if (!marked.size) break;
    if (sizing) {
      // Each marked side adds one child triangle per incident parent.
      const childCount = triangles.reduce(
        (sum, face) =>
          sum +
          1 +
          face.filter((a, i) => marked.has(sideKey(a, face[(i + 1) % 3])))
            .length,
        0,
      );
      checkMeshBudget(childCount, nodes.length + marked.size);
    }
    const midpoints = new Map<string, number>();
    const midpoint = (a: number, b: number) => {
      const key = sideKey(a, b);
      const existing = midpoints.get(key);
      if (existing !== undefined) return existing;
      const u = nodes[a - 1],
        v = nodes[b - 1],
        number = nodes.length + 1;
      nodes.push({
        number,
        x: u.x + (v.x - u.x) / 2,
        y: u.y + (v.y - u.y) / 2,
        z,
        restraints: [],
      });
      midpoints.set(key, number);
      return number;
    };
    triangles = triangles.flatMap((face): Triangle[] => {
      const mids = face.map((a, i) => {
        const b = face[(i + 1) % 3];
        return marked.has(sideKey(a, b)) ? midpoint(a, b) : 0;
      });
      const count = mids.filter(Boolean).length;
      if (count === 0) return [face];
      const [a, b, c] = face,
        [ab, bc, ca] = mids;
      if (count === 3)
        return [
          [a, ab, ca],
          [ab, b, bc],
          [ca, bc, c],
          [ab, bc, ca],
        ];
      if (count === 1) {
        const k = mids.findIndex(Boolean),
          m = mids[k],
          u = face[k],
          v = face[(k + 1) % 3],
          w = face[(k + 2) % 3];
        return [
          [u, m, w],
          [m, v, w],
        ];
      }
      // Two split sides meet at w. Use the shorter diagonal in the remaining quadrilateral.
      const k = mids.indexOf(0),
        u = face[k],
        v = face[(k + 1) % 3],
        w = face[(k + 2) % 3],
        vw = mids[(k + 1) % 3],
        wu = mids[(k + 2) % 3];
      const dist = (i: number, j: number) =>
        Math.hypot(
          nodes[i - 1].x - nodes[j - 1].x,
          nodes[i - 1].y - nodes[j - 1].y,
        );
      return dist(u, vw) <= dist(v, wu)
        ? [
            [w, wu, vw],
            [u, v, vw],
            [u, vw, wu],
          ]
        : [
            [w, wu, vw],
            [u, v, wu],
            [v, vw, wu],
          ];
    });
    for (const [id, line] of Object.entries(edges))
      edges[id] = line.flatMap((a, i) => {
        const m =
          i + 1 < line.length
            ? midpoints.get(sideKey(a, line[i + 1]))
            : undefined;
        return m === undefined ? [a] : [a, m];
      });
  }
  let meshArea = 0;
  for (const [ia, ib, ic] of triangles) {
    const part = cross2(nodes[ia - 1], nodes[ib - 1], nodes[ic - 1]) / 2;
    if (!(part > 0))
      throw new Error(
        "O refinamento gerou um triângulo de área nula ou invertida. Revise as coordenadas das bordas.",
      );
    meshArea += part;
  }
  if (
    !Number.isFinite(meshArea) ||
    Math.abs(meshArea - expected) > 1e-9 * expected
  )
    throw new Error(
      "A precisão das coordenadas não conserva a área líquida ao refinar as bordas.",
    );
  const axes = new Map<number, XY>();
  for (const ring of rings)
    for (const [i, a] of ring.entries()) {
      if (!a.supported) continue;
      const b = ring[nextIndex(i, ring.length)],
        dx = b.x - a.x,
        dy = b.y - a.y,
        length = Math.hypot(dx, dy);
      const tangent = { x: dx / length, y: dy / length };
      for (const number of edges[a.edgeId]) {
        const node = nodes[number - 1],
          prior = axes.get(number);
        if (prior) {
          if (Math.abs(prior.x * tangent.y - prior.y * tangent.x) > 1e-12) {
            node.restraints = [3, 4, 5];
            delete node.tangent;
          }
        } else {
          axes.set(number, tangent);
          node.restraints = dx === 0 ? [3, 4] : [3, 5];
          if (dx !== 0 && dy !== 0) node.tangent = tangent;
        }
      }
    }
  return {
    nodes,
    edges,
    elements: triangles.map((nodes, i) => ({ number: i + 1, nodes })),
  };
}

// Coordinates in the element's interpolation basis, with a dimensionless
// boundary tolerance shared by point probes and the slab sample.
export function areaWeights(points: XY[], point: XY): number[] | null {
  const [a, b, c] = points;
  if (points.length === 4) {
    // QDKT rectangles list (+,+), (-,+), (-,-), (+,-).
    const u = (point.x - c.x) / (a.x - c.x);
    const v = (point.y - c.y) / (a.y - c.y);
    if (u >= -1e-12 && u <= 1 + 1e-12 && v >= -1e-12 && v <= 1 + 1e-12)
      return [u * v, (1 - u) * v, (1 - u) * (1 - v), u * (1 - v)];
    return null;
  }
  const area = cross2(a, b, c);
  const weights = [
    cross2(b, c, point) / area,
    cross2(c, a, point) / area,
    cross2(a, b, point) / area,
  ];
  return weights.every((w) => w >= -1e-12) ? weights : null;
}

export function materialSample(mesh: SlabMesh, centroid: XY) {
  let nearest:
    | { point: XY; face: number[]; weights: number[]; relocated: boolean }
    | undefined;
  let distance = Infinity;
  for (const { nodes: face } of mesh.elements) {
    const points = face.map((i) => mesh.nodes[i - 1]);
    const weights = areaWeights(points, centroid);
    if (weights) return { point: centroid, face, weights, relocated: false };
    const [a, b, c] = points;
    const point =
      face.length === 4
        ? { x: c.x + (a.x - c.x) / 2, y: c.y + (a.y - c.y) / 2 }
        : {
            x: a.x + (b.x - a.x + (c.x - a.x)) / 3,
            y: a.y + (b.y - a.y + (c.y - a.y)) / 3,
          };
    const gap = Math.hypot(point.x - centroid.x, point.y - centroid.y);
    if (gap < distance) {
      nearest = {
        point,
        face,
        weights: face.map(() => 1 / face.length),
        relocated: true,
      };
      distance = gap;
    }
  }
  if (!nearest)
    throw new Error("A malha não possui um ponto material para a consulta.");
  return nearest;
}
