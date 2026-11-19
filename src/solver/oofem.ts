import {
  add,
  cross,
  distance,
  dot,
  interpolate,
  length,
  origin,
  scale,
  subtract,
  type Point3,
} from "../domain/geometry";
import {
  analysisErrors,
  nodalLoad,
  projectSchema,
  type Project,
} from "../domain/model";

export interface MeshNode extends Point3 {
  number: number;
  objectId?: string;
}
export interface MeshElement {
  number: number;
  memberId: string;
  start: number;
  end: number;
  t0: number;
  t1: number;
}
export interface AnalysisInput {
  deck: string;
  nodes: MeshNode[];
  elements: MeshElement[];
  project: Project;
  caseId: string;
}
export interface Displacement {
  ux: number;
  uy: number;
  uz: number;
  rx: number;
  ry: number;
  rz: number;
}
export interface Reaction {
  nodeId: string;
  fx: number;
  fy: number;
  fz: number;
  mx: number;
  my: number;
  mz: number;
}
export interface Station extends Displacement {
  t: number;
  n: number;
  v: number;
  m: number;
  vy: number;
  vz: number;
  mx: number;
  my: number;
  mz: number;
}
export interface AnalysisResult {
  caseId: string;
  solver: string;
  completedAt: string;
  displacements: Record<string, Displacement>;
  reactions: Reaction[];
  members: Record<string, Station[]>;
  rawOutput: string;
}

const spatialDofs = [
  ["ux", 1, "fx"],
  ["uy", 2, "fy"],
  ["uz", 3, "fz"],
  ["rx", 4, "mx"],
  ["ry", 5, "my"],
  ["rz", 6, "mz"],
] as const;
const planarDofs = [spatialDofs[0], spatialDofs[2], spatialDofs[4]];

function beamAxes(a: Point3, b: Point3, roll: number) {
  const unit = (v: Point3) => scale(v, 1 / length(v));
  const x = unit(subtract(b, a));
  const up =
    Math.abs(x.z) > 1 - 1e-8 ? { ...origin, x: 1 } : { ...origin, z: 1 };
  const y0 = unit(cross(up, x));
  const z0 = cross(x, y0);
  const angle = (roll * Math.PI) / 180;
  const z = add(scale(z0, Math.cos(angle)), scale(y0, -Math.sin(angle)));
  return [x, cross(z, x), z] as const;
}

function rectangleTorsion(width: number, height: number) {
  const a = Math.max(width, height),
    b = Math.min(width, height);
  // Saint-Venant torsion constant from the odd terms of the rectangular series.
  let series = 0;
  for (let k = 1; k < 120; k += 2)
    series += Math.tanh((k * Math.PI * a) / (2 * b)) / k ** 5;
  return ((a * b ** 3) / 3) * (1 - ((192 * b) / (Math.PI ** 5 * a)) * series);
}

export function exportOofem(project: Project, caseId: string): AnalysisInput {
  const p = projectSchema.parse(project);
  const errors = analysisErrors(p);
  if (errors.length) throw new Error(errors.join("\n"));
  const analysisCase = p.analysisCases.find((c) => c.id === caseId);
  if (!analysisCase) throw new Error("Caso de análise inexistente.");
  const spatial = p.mode === "spatial";
  const dofs = spatial ? spatialDofs : planarDofs;
  const dofList = `${dofs.length} ${dofs.map(([, number]) => number).join(" ")}`;
  const nodes: MeshNode[] = p.nodes.map((n, i) => ({
    number: i + 1,
    x: n.x,
    y: spatial ? n.y : 0,
    z: n.z,
    objectId: n.id,
  }));
  const elements: MeshElement[] = [];
  const modelNodes = new Map(nodes.map((n) => [n.objectId!, n]));
  const nodeNumber = (id: string) => modelNodes.get(id)!.number;
  const members = new Map(p.members.map((m) => [m.id, m]));
  const axes = new Map<string, ReturnType<typeof beamAxes>>();
  const sectionElements = new Map(
    p.sections.map((s) => [s.id, [] as number[]]),
  );
  const memberElements = new Map<string, number[]>();
  for (const m of p.members) {
    const a = modelNodes.get(m.start)!,
      b = modelNodes.get(m.end)!;
    if (spatial) axes.set(m.id, beamAxes(a, b, m.roll));
    const ids: number[] = [];
    let start = nodeNumber(m.start);
    const count = p.mesh.segmentsPerMember;
    for (let i = 1; i <= count; i++) {
      const end = i === count ? nodeNumber(m.end) : nodes.length + 1;
      if (i < count)
        nodes.push({
          number: end,
          ...interpolate(a, b, i / count),
        });
      ids.push(elements.length + 1);
      elements.push({
        number: elements.length + 1,
        memberId: m.id,
        start,
        end,
        t0: (i - 1) / count,
        t1: i / count,
      });
      start = end;
    }
    sectionElements.get(m.sectionId)!.push(...ids);
    memberElements.set(m.id, ids);
  }
  const sets: string[] = [],
    bcs: string[] = [];
  const set = (value: string) => {
    sets.push(`Set ${sets.length + 1} ${value}`);
    return sets.length;
  };
  const cs = p.sections.map((s, i) => {
    const ids = sectionElements.get(s.id)!;
    const spatialProperties = spatial
      ? ` Iz ${(s.height * s.width ** 3) / 12} Ik ${rectangleTorsion(s.width, s.height)}`
      : "";
    return `SimpleCS ${i + 1} area ${s.width * s.height} Iy ${(s.width * s.height ** 3) / 12}${spatialProperties} beamShearCoeff 1.e18 material ${p.materials.findIndex((m) => m.id === s.materialId) + 1} set ${set(`elements ${ids.length} ${ids.join(" ")}`)}`;
  });
  for (const n of p.nodes) {
    const fixed = dofs.filter(([key]) => n.restraints[key]).map(([, d]) => d);
    if (fixed.length)
      bcs.push(
        `BoundaryCondition ${bcs.length + 1} loadTimeFunction 1 dofs ${fixed.length} ${fixed.join(" ")} values ${fixed.length} ${fixed.map(() => 0).join(" ")} set ${set(`nodes 1 ${nodeNumber(n.id)}`)}`,
      );
  }
  for (const factor of analysisCase.factors) {
    const pat = p.loadPatterns.find((pat) => pat.id === factor.patternId)!;
    for (const l of pat.nodal) {
      const values = dofs.map(([, , key]) => l[key] * factor.factor);
      if (!values.some(Boolean)) continue;
      bcs.push(
        `NodalLoad ${bcs.length + 1} loadTimeFunction 1 dofs ${dofList} Components ${values.length} ${values.join(" ")} set ${set(`nodes 1 ${nodeNumber(l.nodeId)}`)}`,
      );
    }
    for (const l of pat.uniform) {
      if (!factor.factor || !(l.qx || l.qy || l.qz)) continue;
      const ids = memberElements
        .get(l.memberId)!
        .flatMap((number) => [number, 1]);
      const m = members.get(l.memberId)!;
      const a = modelNodes.get(m.start)!,
        b = modelNodes.get(m.end)!;
      const span = distance(a, b);
      const c = (b.x - a.x) / span,
        s = (b.z - a.z) / span;
      // Model loads remain global; both beam elements receive local components.
      const q = { x: l.qx, y: l.qy, z: l.qz };
      const values = spatial
        ? [...axes.get(l.memberId)!.map((axis) => dot(axis, q)), 0, 0, 0]
        : [c * l.qx + s * l.qz, -s * l.qx + c * l.qz, 0];
      bcs.push(
        `ConstantEdgeLoad ${bcs.length + 1} loadTimeFunction 1${spatial ? ` dofs ${dofList}` : ""} Components ${values.length} ${values.map((v) => v * factor.factor).join(" ")} loadType 3 csType 1 set ${set(`elementedges ${ids.length} ${ids.join(" ")}`)}`,
      );
    }
  }
  const deck = [
    "analysis.out",
    `KStruct - linear static ${spatial ? "XYZ" : "XZ"} - SI N m kg s - Euler Bernoulli`,
    "StaticStructural nsteps 1 deltat 1",
    spatial ? "domain 3dShell" : "domain 2dBeam",
    "OutputManager tstep_all dofman_all element_all",
    `ndofman ${nodes.length} nelem ${elements.length} ncrosssect ${cs.length} nmat ${p.materials.length} nbc ${bcs.length} nic 0 nltf 1 nset ${sets.length}`,
    ...nodes.map((n) => `Node ${n.number} coords 3 ${n.x} ${n.y} ${n.z}`),
    ...elements.map((e) => {
      if (!spatial) return `Beam2d ${e.number} nodes 2 ${e.start} ${e.end}`;
      const z = axes.get(e.memberId)![2];
      return `Beam3d ${e.number} nodes 2 ${e.start} ${e.end} zaxis 3 ${z.x} ${z.y} ${z.z}`;
    }),
    ...cs,
    ...p.materials.map(
      (m, i) => `IsoLE ${i + 1} d ${m.density} E ${m.E} n ${m.nu} tAlpha 0`,
    ),
    ...bcs,
    "ConstantFunction 1 f(t) 1",
    ...sets,
    "",
  ].join("\n");
  return { deck, nodes, elements, project: p, caseId };
}

function numberList(line: string) {
  const result = line.trim().split(/\s+/).map(Number);
  if (result.some((n) => !Number.isFinite(n)))
    throw new Error(
      "O OOFEM retornou valores não finitos. Verifique a estabilidade e a escala do modelo.",
    );
  return result;
}

export function parseOofemOutput(
  rawOutput: string,
  input: AnalysisInput,
): AnalysisResult {
  if (
    !rawOutput.includes("Finishing analysis") ||
    (rawOutput.match(/Output for time /g) || []).length !== 1
  )
    throw new Error(
      "Saída incompleta ou incompatível. Esperado um único passo estático concluído.",
    );
  if (/\b(?:nan|inf(?:inity)?)\b/i.test(rawOutput))
    throw new Error("Resultado não finito. Análise rejeitada.");
  const spatial = input.project.mode === "spatial";
  const dofs = spatial ? spatialDofs : planarDofs;
  const d = new Map<number, Displacement>();
  for (const match of rawOutput.matchAll(
    /Node\s+(\d+)\s+\(\s*\d+\):([\s\S]*?)(?=\nNode|\n\s*Element output)/g,
  )) {
    const values = new Map<number, number>();
    for (const v of match[2].matchAll(/dof\s+(\d+)\s+d\s+(\S+)/g))
      values.set(Number(v[1]), numberList(v[2])[0]);
    if (dofs.every(([, k]) => values.has(k)))
      d.set(Number(match[1]), {
        ux: values.get(1)!,
        uy: spatial ? values.get(2)! : 0,
        uz: values.get(3)!,
        rx: spatial ? values.get(4)! : 0,
        ry: values.get(5)!,
        rz: spatial ? values.get(6)! : 0,
      });
  }
  for (const n of input.nodes)
    if (!d.has(n.number))
      throw new Error(`Deslocamentos ausentes no nó de análise ${n.number}.`);
  const forces = new Map<number, number[]>();
  for (const m of rawOutput.matchAll(
    /beam element\s+(\d+)\s+\(\s*\d+\)\s*:\r?\n[^\n]*local displacements[^\n]*\n[ \t]*local end forces[ \t]+([^\n]+)/g,
  )) {
    const f = numberList(m[2]);
    if (f.length === (spatial ? 12 : 6)) forces.set(Number(m[1]), f);
  }
  const members: Record<string, Station[]> = {};
  for (const e of input.elements) {
    const f = forces.get(e.number);
    if (!f)
      throw new Error(`Esforços ausentes no elemento de análise ${e.number}.`);
    const stations = (members[e.memberId] ??= []);
    const station = (end: boolean): Station => {
      const t = end ? e.t1 : e.t0;
      const displacement = d.get(end ? e.end : e.start)!;
      const sign = end ? 1 : -1;
      if (spatial) {
        // Resultants act on the positive local-x face of the cut.
        const [n, vy, vz, mx, my, mz] = (end ? f.slice(6) : f.slice(0, 6)).map(
          (value) => sign * value,
        );
        return { t, ...displacement, n, vy, vz, mx, my, mz, v: vz, m: my };
      }
      const offset = end ? 3 : 0;
      const n = sign * f[offset],
        v = -sign * f[offset + 1],
        m = -sign * f[offset + 2];
      return { t, ...displacement, n, v, m, vy: 0, vz: v, mx: 0, my: m, mz: 0 };
    };
    if (!stations.length) stations.push(station(false));
    stations.push(station(true));
  }
  const reactionMap = new Map<string, number>();
  for (const m of rawOutput.matchAll(
    /Node\s+(\d+)\s+iDof\s+(\d+)\s+reaction\s+(\S+)/g,
  ))
    reactionMap.set(`${m[1]}:${m[2]}`, numberList(m[3])[0]);
  const reactions: Reaction[] = [];
  const modelNumbers = new Map(input.nodes.map((n) => [n.objectId, n.number]));
  for (const n of input.project.nodes) {
    if (!Object.values(n.restraints).some(Boolean)) continue;
    const num = modelNumbers.get(n.id)!;
    const result = nodalLoad(n.id);
    for (const [key, dof, axis] of dofs) {
      if (n.restraints[key]) {
        const value = reactionMap.get(`${num}:${dof}`);
        if (value === undefined)
          throw new Error(`Reação ausente em ${n.name}, ${key}.`);
        result[axis] = value;
      }
    }
    reactions.push(result);
  }
  checkEquilibrium(input.project, input.caseId, reactions);
  return {
    caseId: input.caseId,
    solver: rawOutput.match(/OOFEM ver\.[^\n]+/)?.[0] ?? "OOFEM",
    completedAt: new Date().toISOString(),
    displacements: Object.fromEntries(
      input.nodes
        .filter((n) => n.objectId)
        .map((n) => [n.objectId!, d.get(n.number)!]),
    ),
    reactions,
    members,
    rawOutput,
  };
}

export function checkEquilibrium(
  p: Project,
  caseId: string,
  reactions: Reaction[],
) {
  const sum = [0, 0, 0, 0, 0, 0];
  const magnitudes = [1, 1, 1, 1, 1, 1];
  const reference = p.nodes[0] ?? origin;
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  const members = new Map(p.members.map((m) => [m.id, m]));
  const accumulate = (force: Point3, moment: Point3, point: Point3) => {
    const lever = subtract(point, reference);
    const induced = cross(lever, force);
    const net = add(moment, induced);
    [force.x, force.y, force.z, net.x, net.y, net.z].forEach((value, i) => {
      sum[i] += value;
    });
    // Scale moment tolerance by each printed reaction's contribution before cancellation.
    [
      force.x,
      force.y,
      force.z,
      Math.abs(moment.x) +
        Math.abs(lever.y * force.z) +
        Math.abs(lever.z * force.y),
      Math.abs(moment.y) +
        Math.abs(lever.z * force.x) +
        Math.abs(lever.x * force.z),
      Math.abs(moment.z) +
        Math.abs(lever.x * force.y) +
        Math.abs(lever.y * force.x),
    ].forEach((value, i) => {
      magnitudes[i] += Math.abs(value);
    });
  };
  const accumulateNodal = (f: Reaction, factor: number) =>
    accumulate(
      scale({ x: f.fx, y: f.fy, z: f.fz }, factor),
      scale({ x: f.mx, y: f.my, z: f.mz }, factor),
      byId.get(f.nodeId)!,
    );
  for (const r of reactions) {
    accumulateNodal(r, 1);
  }
  for (const f of p.analysisCases.find((c) => c.id === caseId)!.factors) {
    const pat = p.loadPatterns.find((l) => l.id === f.patternId)!;
    for (const l of pat.nodal) accumulateNodal(l, f.factor);
    for (const l of pat.uniform) {
      const m = members.get(l.memberId)!;
      const a = byId.get(m.start)!,
        b = byId.get(m.end)!;
      accumulate(
        scale({ x: l.qx, y: l.qy, z: l.qz }, distance(a, b) * f.factor),
        origin,
        interpolate(a, b, 0.5),
      );
    }
  }
  if (
    sum.some(
      (v, i) => !Number.isFinite(v) || Math.abs(v) > 1e-3 * magnitudes[i],
    )
  )
    throw new Error(
      "A saída não fechou o equilíbrio global de forças e momentos. Resultados rejeitados.",
    );
}
