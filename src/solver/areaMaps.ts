import { cross2, slabRings, type XY } from "../domain/slabPolygon";
import { areaWeights } from "../domain/polygonMesh";
import { add, subtract, scale } from "../domain/geometry";
import type { Project } from "../domain/model";
import { globalBasis, inLocal, panelGeometry } from "../domain/surfacePanel";
import type { AnalysisResult } from "./oofem";
import type { SlabSample } from "./slab";
import { panelFields } from "./surfacePanel";

export const areaFields = {
  uz: ["Flecha UZ", "displacement"],
  mx: ["Momento Mx", "moment"],
  my: ["Momento My", "moment"],
  u1: ["Deslocamento U1", "displacement"],
  u2: ["Deslocamento U2", "displacement"],
  u3: ["Deslocamento U3", "displacement"],
  nxx: ["Força N11", "distributedLoad"],
  nyy: ["Força N22", "distributedLoad"],
  nxy: ["Força N12", "distributedLoad"],
  mxx: ["Momento M11", "moment"],
  myy: ["Momento M22", "moment"],
  mxy: ["Momento M12", "moment"],
} as const;

export type AreaField = keyof typeof areaFields;
export type Recovery = "element" | "smooth";
export type MapFace = {
  number: number;
  points: XY[];
  value?: number;
  corners?: number[];
};
export type AreaMap = { faces: MapFace[]; range: Limits | null };
export type Limits = readonly [number, number];

export function comparisonAreas(project: Project) {
  return [
    ...project.slabs.map((slab) => {
      const rings = slabRings(slab);
      const base = rings[0][0];
      const origin = {
        x: base.x,
        y: base.y,
        z: project.guides.z.find(({ id }) => id === slab.levelId)!.position,
      };
      return {
        id: slab.id,
        name: slab.name,
        kind: "slab" as const,
        origin,
        axes: globalBasis,
        resultAxes: globalBasis,
        rings: rings.map((ring) =>
          ring.map((pt) => ({ x: pt.x - origin.x, y: pt.y - origin.y })),
        ),
        fields: ["uz", "mx", "my"] as AreaField[],
        angle: 0,
      };
    }),
    ...(project.surfacePanels ?? []).map((panel) => {
      const geometry = panelGeometry(panel);
      const fields: AreaField[] = ["u1", "u2", "u3"];
      if (panel.kind !== "plate") fields.push("nxx", "nyy", "nxy");
      if (panel.kind !== "membrane") fields.push("mxx", "myy", "mxy");
      return {
        id: panel.id,
        name: panel.name,
        kind: "panel" as const,
        origin: panel.a,
        axes: geometry.axes,
        resultAxes: geometry.materialAxes,
        rings: [
          [...Object.values(geometry.corners)].map((pt) =>
            inLocal(subtract(pt, panel.a), geometry.axes),
          ),
        ],
        fields,
        angle: panel.angleDeg ?? 0,
      };
    }),
  ];
}
export type ComparisonArea = ReturnType<typeof comparisonAreas>[number];

// A saved mesh can be compared after remeshing. Any physical or load model edit
// invalidates the saved result, including edits to the connected panel or frame.
export function comparisonModelKey(project: Project) {
  return JSON.stringify({
    ...project,
    slabs: project.slabs.map((slab) => ({
      ...slab,
      divisionsX: undefined,
      divisionsY: undefined,
      sizing: undefined,
      polygon: slab.polygon ? { rings: slab.polygon.rings } : undefined,
    })),
    surfacePanels: project.surfacePanels?.map(
      ({ nu: _nu, nv: _nv, ...panel }) => panel,
    ),
    mesh: undefined,
    selectionGroups: undefined,
    sectionCuts: undefined,
  });
}

type AreaNode = XY & { value?: number };
function recoverFaces(
  nodes: Map<number, AreaNode>,
  elements: { number: number; nodes: number[] }[],
  getValue: (i: number) => number | undefined,
  average: boolean,
  method: Recovery,
): AreaMap {
  const faces = elements.map((e) => {
    const points = e.nodes.map((id) => nodes.get(id)!);
    return { number: e.number, points, value: getValue(e.number) };
  });
  const nodeValues = new Map<number, { sum: number; weight: number }>();
  if (method === "smooth" && average) {
    for (const [i, face] of faces.entries()) {
      if (face.value === undefined || !Number.isFinite(face.value)) continue;
      const weight = Math.abs(cross2(...(face.points as [XY, XY, XY])));
      for (const id of elements[i].nodes) {
        const total = nodeValues.get(id) ?? { sum: 0, weight: 0 };
        total.sum += weight * face.value;
        total.weight += weight;
        nodeValues.set(id, total);
      }
    }
  }
  let min = Infinity,
    max = -Infinity;
  const mapped = faces.map((face, i): MapFace => {
    if (face.value === undefined || !Number.isFinite(face.value))
      return { ...face, value: undefined };
    const corners =
      method === "smooth"
        ? elements[i].nodes.map((id) => {
            if (!average) return nodes.get(id)?.value;
            const total = nodeValues.get(id);
            return total && total.sum / total.weight;
          })
        : undefined;
    const values = corners ?? [face.value];
    if (
      !values.every(
        (value): value is number =>
          value !== undefined && Number.isFinite(value),
      )
    )
      return { ...face, value: undefined };
    for (const value of values) {
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    return { ...face, corners: corners as number[] | undefined };
  });
  return { faces: mapped, range: min <= max ? [min, max] : null };
}

export function buildAreaMap(
  result: AnalysisResult,
  area: ComparisonArea,
  field: AreaField,
  method: Recovery,
): AreaMap | null {
  if (!area.fields.includes(field)) return null;
  if (area.kind === "slab") {
    const slab =
      result.floor?.panels.find(({ slabId }) => slabId === area.id) ??
      (result.slab?.slabId === area.id ? result.slab : undefined);
    if (!slab) return null;
    const key = field as keyof SlabSample;
    const nodes = new Map(
      slab.mesh.nodes.map(({ x, y, number }, i) => [
        number,
        {
          x: x - area.origin.x,
          y: y - area.origin.y,
          value: slab.nodes[i]?.[key],
        },
      ]),
    );
    const values = new Map(
      slab.mesh.elements.map(({ number }, i) => [
        number,
        slab.elements[i]?.[key],
      ]),
    );
    return recoverFaces(
      nodes,
      slab.mesh.elements,
      (i) => values.get(i),
      false,
      method,
    );
  }

  const panel = result.panels?.panels.find(
    ({ panelId }) => panelId === area.id,
  );
  if (!panel) return null;
  const axis = ({ u1: "x", u2: "y", u3: "z" } as const)[
    field as "u1" | "u2" | "u3"
  ];
  const nodes = new Map(
    panel.nodes.map((n) => [
      n.id,
      {
        ...inLocal(subtract(n.point, area.origin), area.axes),
        value: axis ? n.local[axis] : undefined,
      },
    ]),
  );
  if (axis) {
    const values = new Map(
      panel.elements.map((e) => {
        const terms = e.nodes.map((id) => nodes.get(id)?.value);
        return [
          e.number,
          terms.every((v): v is number => v !== undefined)
            ? terms.reduce((sum, v) => sum + v / terms.length, 0)
            : undefined,
        ] as const;
      }),
    );
    return recoverFaces(
      nodes,
      panel.elements,
      (i) => values.get(i),
      false,
      method,
    );
  }
  if (!panelFields.some((key) => key === field)) return null;
  const values = new Map<number, number[]>();
  for (const sample of panel.samples) {
    // GP 1 is the centroid. GP 2–4 form a symmetric triangle whose
    // arithmetic mean is the mean of the represented linear field.
    const value = sample.fields[field as (typeof panelFields)[number]];
    if (sample.gp === 1 || value === undefined) continue;
    const row = values.get(sample.element) ?? [];
    row.push(value);
    values.set(sample.element, row);
  }
  return recoverFaces(
    nodes,
    panel.elements,
    (i) => {
      const row = values.get(i);
      return row?.length === 3
        ? row.reduce((sum, v) => sum + v / 3, 0)
        : undefined;
    },
    true,
    method,
  );
}

export const interpolateArea = (values: number[], weights: number[]) =>
  values.reduce((sum, value, i) => sum + value * weights[i], 0);

export function probeArea(map: AreaMap | null, point: XY) {
  return (
    map?.faces.flatMap((face) => {
      const weights = areaWeights(face.points, point);
      return weights
        ? [
            {
              element: face.number,
              value: face.corners
                ? interpolateArea(face.corners, weights)
                : face.value,
            },
          ]
        : [];
    }) ?? []
  );
}

export function otherAreaPoint(
  area: ComparisonArea,
  point: XY,
  other: ComparisonArea,
) {
  const global = add(
    area.origin,
    add(scale(area.axes[0], point.x), scale(area.axes[1], point.y)),
  );
  const local = inLocal(subtract(global, other.origin), other.axes);
  return Math.abs(local.z) <= 1e-6 ? local : null;
}

export function sharedLimits(maps: (AreaMap | null)[]): Limits | null {
  const ranges = maps.flatMap((map) => (map?.range ? [map.range] : []));
  return ranges.length
    ? [
        Math.min(...ranges.map((r) => r[0])),
        Math.max(...ranges.map((r) => r[1])),
      ]
    : null;
}

export function areaMapColor(value: number, [min, max]: Limits) {
  // Normalize before subtracting to avoid overflow for large opposite limits.
  const scale = Math.max(Math.abs(min), Math.abs(max));
  const t =
    max === min
      ? 0.5
      : (Math.min(max, Math.max(min, value)) / scale - min / scale) /
        (max / scale - min / scale);
  const stops =
    t <= 0.5
      ? [
          [43, 111, 171],
          [236, 239, 242],
        ]
      : [
          [236, 239, 242],
          [174, 78, 23],
        ];
  const weight = t <= 0.5 ? 2 * t : 2 * t - 1;
  return `rgb(${stops[0].map((v, i) => Math.round(v * (1 - weight) + stops[1][i] * weight)).join(", ")})`;
}
