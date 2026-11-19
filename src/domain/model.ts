import { z } from "zod";
import {
  distance,
  interiorParameter,
  subtract,
  tolerance,
  type Point3,
} from "./geometry";

const id = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[\w-]+$/)
  .refine((v) => !["__proto__", "constructor", "prototype"].includes(v));
const finite = z.number().finite();
const text = z.string().min(1).max(120);
const flag = z.boolean();
const planarRestraints = z.object({ ux: flag, uz: flag, ry: flag }).strict();
const restraints = planarRestraints.extend({ uy: flag, rx: flag, rz: flag });
const legacyNode = z
  .object({
    id,
    name: text,
    x: finite,
    y: finite,
    z: finite,
    restraints: planarRestraints,
  })
  .strict();
const nodeSchema = legacyNode.extend({ restraints });
const materialSchema = z
  .object({
    id,
    name: text,
    E: finite.positive(),
    nu: finite.min(0).lt(0.5),
    density: finite.positive(),
  })
  .strict();
const sectionSchema = z
  .object({
    id,
    name: text,
    materialId: id,
    width: finite.positive(),
    height: finite.positive(),
  })
  .strict();
const legacyMember = z
  .object({ id, name: text, start: id, end: id, sectionId: id })
  .strict();
const memberSchema = legacyMember.extend({ roll: finite.min(-360).max(360) });
const legacyNodal = z
  .object({ nodeId: id, fx: finite, fz: finite, my: finite })
  .strict();
const legacyUniform = z
  .object({ memberId: id, qx: finite, qz: finite })
  .strict();
const legacyPattern = z
  .object({
    id,
    name: text,
    nodal: z.array(legacyNodal).max(5000),
    uniform: z.array(legacyUniform).max(5000),
  })
  .strict();
const patternSchema = legacyPattern.extend({
  nodal: z
    .array(legacyNodal.extend({ fy: finite, mx: finite, mz: finite }))
    .max(5000),
  uniform: z.array(legacyUniform.extend({ qy: finite })).max(5000),
});
const guideSchema = z.object({ id, name: text, position: finite }).strict();
const legacySchema = z
  .object({
    format: z.literal("kstruct"),
    schemaVersion: z.literal(1),
    id,
    name: text,
    units: z.literal("N-m-kg-s"),
    nodes: z.array(legacyNode).max(1000),
    members: z.array(legacyMember).max(1000),
    materials: z.array(materialSchema).min(1).max(100),
    sections: z.array(sectionSchema).min(1).max(100),
    loadPatterns: z.array(legacyPattern).min(1).max(100),
    analysisCases: z
      .array(
        z
          .object({
            id,
            name: text,
            type: z.literal("linear-static"),
            factors: z
              .array(z.object({ patternId: id, factor: finite }).strict())
              .min(1),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    mesh: z
      .object({ segmentsPerMember: z.number().int().min(2).max(32) })
      .strict(),
  })
  .strict();
export const projectSchema = legacySchema.extend({
  schemaVersion: z.literal(2),
  mode: z.enum(["planar", "spatial"]),
  nodes: z.array(nodeSchema).max(1000),
  members: z.array(memberSchema).max(1000),
  loadPatterns: z.array(patternSchema).min(1).max(100),
  guides: z
    .object({
      x: z.array(guideSchema).min(1).max(40),
      y: z.array(guideSchema).min(1).max(40),
      z: z.array(guideSchema).min(1).max(40),
    })
    .strict(),
});

export type Project = z.infer<typeof projectSchema>;
export type StructuralNode = Project["nodes"][number];
export type Member = Project["members"][number];
export type NodalLoad = Project["loadPatterns"][number]["nodal"][number];
export type UniformLoad = Project["loadPatterns"][number]["uniform"][number];
export type SelectedObject = { kind: "node" | "member"; id: string };
export type Selection = SelectedObject | null;
export const uid = () => crypto.randomUUID();
export const free = () => ({
  ux: false,
  uy: false,
  uz: false,
  rx: false,
  ry: false,
  rz: false,
});
export const nodalLoad = (nodeId: string): NodalLoad => ({
  nodeId,
  fx: 0,
  fy: 0,
  fz: 0,
  mx: 0,
  my: 0,
  mz: 0,
});
export const uniformLoad = (memberId: string): UniformLoad => ({
  memberId,
  qx: 0,
  qy: 0,
  qz: 0,
});

function defaultGuides(): Project["guides"] {
  const guide = (id: string, name: string, position: number) => ({
    id,
    name,
    position,
  });
  return {
    x: [guide("X1", "1", 0), guide("X2", "2", 4), guide("X3", "3", 8)],
    y: [guide("YA", "A", 0), guide("YB", "B", 4), guide("YC", "C", 8)],
    z: [
      guide("base", "Base", 0),
      guide("level1", "Pav. 1", 3),
      guide("level2", "Pav. 2", 6),
    ],
  };
}

export function createProject(mode: Project["mode"] = "planar"): Project {
  return {
    format: "kstruct",
    schemaVersion: 2,
    id: uid(),
    name: "Projeto sem título",
    units: "N-m-kg-s",
    mode,
    guides: defaultGuides(),
    nodes: [],
    members: [],
    materials: [
      { id: "steel", name: "Material M1", E: 2e11, nu: 0.3, density: 7850 },
    ],
    sections: [
      {
        id: "rect",
        name: "Retangular R1",
        materialId: "steel",
        width: 0.15,
        height: 0.2,
      },
    ],
    loadPatterns: [
      { id: "G", name: "Carga permanente", nodal: [], uniform: [] },
    ],
    analysisCases: [
      {
        id: "EL",
        name: "EL · Estática linear",
        type: "linear-static",
        factors: [{ patternId: "G", factor: 1 }],
      },
    ],
    mesh: { segmentsPerMember: 8 },
  };
}

export function beamExample(): Project {
  const p = createProject();
  p.name = "Viga biapoiada · 6 m";
  p.nodes = [
    {
      id: "A",
      name: "N1",
      x: 0,
      y: 0,
      z: 0,
      restraints: { ...free(), ux: true, uz: true },
    },
    {
      id: "B",
      name: "N2",
      x: 6,
      y: 0,
      z: 0,
      restraints: { ...free(), uz: true },
    },
  ];
  p.members = [
    { id: "V1", name: "B1", start: "A", end: "B", sectionId: "rect", roll: 0 },
  ];
  p.loadPatterns[0].uniform = [{ ...uniformLoad("V1"), qz: -10000 }];
  return p;
}

export function serializeProject(p: Project) {
  return JSON.stringify(projectSchema.parse(p), null, 2);
}

export function parseProject(source: string): Project {
  if (source.length > 5_000_000)
    throw new Error("O arquivo excede o limite inicial de 5 MB.");
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error("O arquivo não contém um JSON válido.");
  }
  const legacy = legacySchema.safeParse(value);
  if (legacy.success) {
    const v1 = legacy.data;
    value = {
      ...v1,
      schemaVersion: 2,
      mode: "planar",
      guides: defaultGuides(),
      nodes: v1.nodes.map((n) => ({
        ...n,
        restraints: { ...free(), ...n.restraints },
      })),
      members: v1.members.map((m) => ({ ...m, roll: 0 })),
      loadPatterns: v1.loadPatterns.map((p) => ({
        ...p,
        nodal: p.nodal.map((l) => ({ ...nodalLoad(l.nodeId), ...l })),
        uniform: p.uniform.map((l) => ({ ...uniformLoad(l.memberId), ...l })),
      })),
    };
  }
  const parsed = projectSchema.safeParse(value);
  if (!parsed.success)
    throw new Error(
      "Formato incompatível. Use um projeto KStruct versão 1 ou 2, com valores numéricos finitos.",
    );
  const errors = referenceErrors(parsed.data);
  if (errors.length) throw new Error(errors.join("\n"));
  return parsed.data;
}

export function referenceErrors(p: Project): string[] {
  const errors: string[] = [];
  for (const list of [
    p.nodes,
    p.members,
    p.materials,
    p.sections,
    p.loadPatterns,
    p.analysisCases,
    ...Object.values(p.guides),
  ]) {
    if (new Set(list.map((v) => v.id)).size !== list.length)
      errors.push("Há identificadores duplicados no projeto.");
  }
  for (const guides of Object.values(p.guides)) {
    if (
      guides.some((a, i) =>
        guides
          .slice(i + 1)
          .some((b) => Math.abs(a.position - b.position) < tolerance),
      )
    )
      errors.push(
        "Use posições distintas para os eixos ou pavimentos do mesmo grupo.",
      );
  }
  const nodes = new Map(p.nodes.map((n) => [n.id, n]));
  for (const m of p.members) {
    if (!nodes.has(m.start) || !nodes.has(m.end))
      errors.push(`${m.name}: nó de extremidade inexistente.`);
    if (!p.sections.some((s) => s.id === m.sectionId))
      errors.push(`${m.name}: seção inexistente.`);
  }
  for (const s of p.sections)
    if (!p.materials.some((m) => m.id === s.materialId))
      errors.push(`${s.name}: material inexistente.`);
  for (const pat of p.loadPatterns) {
    if (pat.nodal.some((l) => !nodes.has(l.nodeId)))
      errors.push(`${pat.name}: carga em nó inexistente.`);
    if (pat.uniform.some((l) => !p.members.some((m) => m.id === l.memberId)))
      errors.push(`${pat.name}: carga em barra inexistente.`);
  }
  for (const c of p.analysisCases)
    if (
      c.factors.some((f) => !p.loadPatterns.some((l) => l.id === f.patternId))
    )
      errors.push(`${c.name}: padrão de carga inexistente.`);
  return errors;
}

function rank(rows: number[][], columns: number): number {
  const a = rows.map((row) => [...row]);
  let r = 0;
  for (let c = 0; c < columns && r < a.length; c++) {
    let pivot = r;
    for (let i = r + 1; i < a.length; i++)
      if (Math.abs(a[i][c]) > Math.abs(a[pivot][c])) pivot = i;
    if (Math.abs(a[pivot][c]) <= 1e-8) continue;
    [a[r], a[pivot]] = [a[pivot], a[r]];
    const v = a[r][c];
    a[r] = a[r].map((x) => x / v);
    for (let i = r + 1; i < a.length; i++) {
      const f = a[i][c];
      a[i] = a[i].map((x, j) => x - f * a[r][j]);
    }
    r++;
  }
  return r;
}

export function analysisErrors(p: Project): string[] {
  const errors = referenceErrors(p);
  if (errors.length) return errors;
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  if (!p.members.length)
    errors.push("Lance pelo menos uma barra para analisar.");
  if (p.mode === "planar") {
    if (p.nodes.some((n) => Math.abs(n.y) > 1e-8))
      errors.push(
        "Em um projeto plano, todos os nós devem estar em XZ (Y = 0).",
      );
    if (
      p.nodes.some(
        (n) => n.restraints.uy || n.restraints.rx || n.restraints.rz,
      ) ||
      p.members.some((m) => m.roll) ||
      p.loadPatterns.some(
        (l) =>
          l.nodal.some((f) => f.fy || f.mx || f.mz) ||
          l.uniform.some((q) => q.qy),
      )
    )
      errors.push(
        "Apoios, cargas e rotação de seção fora do plano XZ exigem um projeto espacial.",
      );
  }
  const edges = new Map(p.nodes.map((n) => [n.id, new Set<string>()]));
  const pairs = new Set<string>();
  for (const m of p.members) {
    const a = byId.get(m.start)!;
    const b = byId.get(m.end)!;
    if (distance(a, b) < tolerance) errors.push(`${m.name}: comprimento nulo.`);
    edges.get(m.start)!.add(m.end);
    edges.get(m.end)!.add(m.start);
    const key = [m.start, m.end].sort().join("|");
    if (pairs.has(key)) errors.push(`${m.name}: barra duplicada.`);
    pairs.add(key);
    for (const n of p.nodes)
      if (n.id !== a.id && n.id !== b.id && interiorParameter(n, a, b) !== null)
        errors.push(
          `${n.name} está no interior de ${m.name}. Use Conectar interseções.`,
        );
  }
  if (p.nodes.some((n) => !edges.get(n.id)!.size))
    errors.push("Remova ou conecte os nós isolados antes de analisar.");
  if (
    p.nodes.some((a, i) =>
      p.nodes.slice(i + 1).some((b) => distance(a, b) < tolerance),
    )
  )
    errors.push(
      "Há nós coincidentes com IDs distintos. Conecte as barras ao mesmo nó.",
    );
  const visited = new Set<string>();
  for (const seed of p.nodes) {
    if (visited.has(seed.id)) continue;
    const stack = [seed.id];
    const component: StructuralNode[] = [];
    while (stack.length) {
      const id = stack.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      component.push(byId.get(id)!);
      stack.push(...edges.get(id)!);
    }
    const span = Math.max(
      tolerance,
      ...component.map((n) => distance(n, seed)),
    );
    const constraints: number[][] = [];
    for (const n of component) {
      const pos = subtract(n, seed);
      const [x, y, z] = [pos.x / span, pos.y / span, pos.z / span];
      const r = n.restraints;
      if (p.mode === "planar") {
        if (r.ux) constraints.push([1, 0, z]);
        if (r.uz) constraints.push([0, 1, -x]);
        if (r.ry) constraints.push([0, 0, 1]);
      } else {
        // Restrict translation plus rotation cross the node's relative position.
        if (r.ux) constraints.push([1, 0, 0, 0, z, -y]);
        if (r.uy) constraints.push([0, 1, 0, -z, 0, x]);
        if (r.uz) constraints.push([0, 0, 1, y, -x, 0]);
        if (r.rx) constraints.push([0, 0, 0, 1, 0, 0]);
        if (r.ry) constraints.push([0, 0, 0, 0, 1, 0]);
        if (r.rz) constraints.push([0, 0, 0, 0, 0, 1]);
      }
    }
    const dofs = p.mode === "planar" ? 3 : 6;
    if (rank(constraints, dofs) < dofs)
      errors.push(
        `Estrutura ligada a ${seed.name}: apoios insuficientes para impedir movimento de corpo rígido.`,
      );
  }
  return [...new Set(errors)];
}

export function nextName(prefix: string, objects: { name: string }[]) {
  let i = 1;
  const names = new Set(objects.map((o) => o.name));
  while (names.has(`${prefix}${i}`)) i++;
  return `${prefix}${i}`;
}

export function addPoint(p: Project, point: Point3): StructuralNode {
  const existing = p.nodes.find((n) => distance(n, point) < tolerance);
  if (existing) return existing;
  const n: StructuralNode = {
    x: point.x,
    y: point.y,
    z: point.z,
    id: uid(),
    name: nextName("N", p.nodes),
    restraints: free(),
  };
  p.nodes.push(n);
  return n;
}

export function removeSelection(p: Project, selection: SelectedObject[]) {
  const nodes = new Set(
    selection.filter((s) => s.kind === "node").map((s) => s.id),
  );
  const bars = new Set(
    selection.filter((s) => s.kind === "member").map((s) => s.id),
  );
  p.members = p.members.filter((m) => {
    if (nodes.has(m.start) || nodes.has(m.end)) bars.add(m.id);
    return !bars.has(m.id);
  });
  p.nodes = p.nodes.filter((n) => !nodes.has(n.id));
  for (const pat of p.loadPatterns) {
    pat.uniform = pat.uniform.filter((l) => !bars.has(l.memberId));
    pat.nodal = pat.nodal.filter((l) => !nodes.has(l.nodeId));
  }
}
