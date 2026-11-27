import { remapSlabPressures } from "./surfacePressure";
import { refreshJoint } from "./slabJoint";
import {
  normalizeRings,
  slabRings,
  type SlabRing,
  type XY,
} from "./slabPolygon";
import { rebaseThermal } from "./thermalLoads";
import {
  distributedLoadError,
  rebaseDistributedLoad,
} from "./memberDistributedLoads";
import {
  actionPoint,
  pointLoadFrame,
  positionError,
  rebasePointLoad,
} from "./memberPointLoads";
import { memberAxis, offsetError, splitOffsets } from "./memberOffsets";
import { connectionStations } from "./beamMesh";
import { selectionKey } from "./selection";
import {
  add,
  cross,
  distance,
  dot,
  interiorParameter,
  length,
  memberLengthError,
  scale,
  subtract,
  tolerance,
  type Point3,
} from "./geometry";
import {
  addPoint,
  appendMember,
  nextName,
  uid,
  type Member,
  type Project,
  type RectangleSlab,
  type PolygonSlab,
} from "./model";

export function inspectNodeCoordinateChanges(
  project: Project,
  changes: ReadonlyMap<string, Partial<Point3>>,
) {
  const issues: { message: string; nodeIds: string[] }[] = [];
  if (!changes.size) return { nodes: project.nodes, issues };
  const nodes = project.nodes.map((node) =>
    changes.has(node.id) ? { ...node, ...changes.get(node.id) } : node,
  );
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const member of project.members) {
    const moved = [member.start, member.end].filter((id) => changes.has(id));
    if (!moved.length) continue;
    const message = memberLengthError(
      member,
      byId.get(member.start)!,
      byId.get(member.end)!,
    );
    const error =
      message ??
      offsetError(
        member,
        byId.get(member.start)!,
        byId.get(member.end)!,
        project.mode,
      );
    if (error) issues.push({ message: error, nodeIds: moved });
    else {
      const span = memberAxis(
        member,
        byId.get(member.start)!,
        byId.get(member.end)!,
      ).span;
      for (const pat of project.loadPatterns) {
        for (const load of pat.distributed ?? []) {
          if (load.memberId !== member.id) continue;
          const invalid = distributedLoadError(load, span, project.mode);
          if (invalid)
            issues.push({
              message: `${member.name} · ${pat.name}: ${invalid}`,
              nodeIds: moved,
            });
        }
        for (const load of pat.points ?? []) {
          if (
            load.memberId === member.id &&
            positionError(load.position, span)
          ) {
            issues.push({
              message: `${member.name}: uma carga concentrada de ${pat.name} ficaria fora da barra.`,
              nodeIds: moved,
            });
            break;
          }
        }
      }
    }
  }
  if (!issues.length && project.meshConnections.length) {
    try {
      connectionStations({ ...project, nodes });
    } catch (error) {
      issues.push({
        message: error instanceof Error ? error.message : String(error),
        nodeIds: [],
      });
    }
  }
  return { nodes, issues };
}

export function addMember(
  p: Project,
  from: Point3,
  to: Point3,
  properties: Pick<Member, "sectionId" | "roll"> = {
    sectionId: p.sections[0].id,
    roll: 0,
  },
) {
  if (distance(from, to) < tolerance)
    throw new Error("Escolha uma extremidade diferente para a barra.");
  const a = addPoint(p, from);
  const b = addPoint(p, to);
  if (a.id === b.id)
    throw new Error("Escolha uma extremidade diferente para a barra.");
  return appendMember(p, {
    start: a.id,
    end: b.id,
    ...properties,
  });
}

export function reverseMember(p: Project, id: string) {
  const member = p.members.find((item) => item.id === id);
  if (!member) throw new Error("A barra selecionada não existe.");
  const nodes = new Map(p.nodes.map((n) => [n.id, n]));
  const from = pointLoadFrame(member, nodes, p.mode);
  [member.start, member.end] = [member.end, member.start];
  [member.connectionI, member.connectionJ] = [
    member.connectionJ,
    member.connectionI,
  ];
  if (member.offsets)
    member.offsets = { i: member.offsets.j, j: member.offsets.i };
  // In Beam3d, z at zero roll is even in x and y is odd. Negating roll
  // keeps z fixed in global space when x changes sign.
  if (p.mode === "spatial" && member.roll) member.roll = -member.roll;
  const to = pointLoadFrame(member, nodes, p.mode);
  for (const pat of p.loadPatterns)
    if (pat.points)
      pat.points = pat.points.map((l) =>
        l.memberId === id ? rebasePointLoad(l, from, to, id) : l,
      );
  for (const pat of p.loadPatterns)
    if (pat.distributed)
      pat.distributed = pat.distributed.map((load) =>
        load.memberId === id ? rebaseDistributedLoad(load, from, to, id) : load,
      );
  for (const pat of p.loadPatterns) {
    const field = pat.thermal?.find((f) => f.memberId === id);
    if (field) {
      const section = p.sections.find((s) => s.id === member.sectionId)!;
      Object.assign(
        field,
        rebaseThermal(field, from.axes, to.axes, id, section),
      );
    }
  }
  for (const measure of p.serviceMeasures ?? [])
    if (measure.kind === "chord" && measure.memberId === id)
      measure.t = 1 - measure.t;
  // Mesh connections refer to physical node IDs and derive x/L from i and j.
  // Uniform loads are global, and groups and sections refer to the same ID.
}

function slabDefaults(p: Project, levelId: string) {
  if (p.mode !== "spatial" || !p.guides.z.some((level) => level.id === levelId))
    throw new Error("Lance a laje na planta XY de um pavimento.");
  if (p.slabs.length >= 2)
    throw new Error("Este pavimento acoplado já contém duas lajes.");
  const concrete = { E: 30e9, nu: 0.2, density: 2500, alpha: 0 };
  let material = p.materials.find(
    (item) =>
      item.E === concrete.E &&
      item.nu === concrete.nu &&
      item.density === concrete.density &&
      item.alpha === concrete.alpha,
  );
  if (!material) {
    material = { id: uid(), name: "Concreto", ...concrete };
    p.materials.push(material);
  }
  return {
    id: uid(),
    name: nextName("L", p.slabs),
    levelId,
    thickness: 0.1,
    materialId: material.id,
  };
}

export function newSlabRing(points: XY[], supported: boolean): SlabRing {
  return points.map(({ x, y }) => ({ x, y, edgeId: uid(), supported }));
}

export function addPolygonSlab(
  p: Project,
  levelId: string,
  rings: SlabRing[],
): PolygonSlab {
  const polygon = { rings: normalizeRings(rings), refinements: 2 };
  const slab: PolygonSlab = {
    ...slabDefaults(p, levelId),
    formulation: "dkt",
    polygon,
  };
  p.slabs.push(slab);
  refreshJoint(p);
  return slab;
}

export function addSlabOpening(p: Project, slabId: string, points: XY[]) {
  const index = p.slabs.findIndex((s) => s.id === slabId);
  const slab = p.slabs[index];
  if (!slab)
    throw new Error("Selecione a laje do pavimento para traçar a abertura.");
  const rings = normalizeRings([
    ...slabRings(slab),
    newSlabRing(points, false),
  ]);
  const { id, name, levelId, thickness, materialId } = slab;
  p.slabs[index] = {
    id,
    name,
    levelId,
    thickness,
    materialId,
    formulation: "dkt",
    ...(slab.sizing ? { sizing: slab.sizing } : {}),
    polygon: { rings, refinements: slab.polygon?.refinements ?? 2 },
  };
  remapSlabPressures(p, slab, p.slabs[index]);
  refreshJoint(p);
}

export function addSlab(
  p: Project,
  levelId: string,
  from: Point3,
  to: Point3,
): RectangleSlab {
  const level = p.guides.z.find((item) => item.id === levelId);
  if (
    p.mode !== "spatial" ||
    !level ||
    from.z !== level.position ||
    to.z !== level.position
  )
    throw new Error("Lance a laje na planta XY de um pavimento.");
  const lengthX = Math.abs(to.x - from.x);
  const lengthY = Math.abs(to.y - from.y);
  if (lengthX < tolerance || lengthY < tolerance)
    throw new Error("Marque dois cantos opostos para definir um retângulo.");
  const slab: RectangleSlab = {
    ...slabDefaults(p, levelId),
    x: Math.min(from.x, to.x),
    y: Math.min(from.y, to.y),
    lengthX,
    lengthY,
    formulation: "qdkt",
    divisionsX: 8,
    divisionsY: 6,
    supports: { xMin: true, xMax: true, yMin: true, yMax: true },
  };
  p.slabs.push(slab);
  refreshJoint(p);
  return slab;
}

export { replicate } from "./transform";

function crossing(a: Point3, b: Point3, c: Point3, d: Point3) {
  const ab = subtract(b, a),
    cd = subtract(d, c);
  const la = length(ab),
    lb = length(cd);
  if (la < tolerance || lb < tolerance) return null;
  const u = scale(ab, 1 / la),
    v = scale(cd, 1 / lb);
  const normal = cross(u, v);
  const denominator = dot(normal, normal);
  const offset = subtract(c, a);
  if (denominator < 1e-20) {
    if (length(cross(offset, u)) >= tolerance) return null;
    const s = dot(offset, u),
      t = dot(subtract(d, a), u);
    const overlap = Math.min(la, Math.max(s, t)) - Math.max(0, Math.min(s, t));
    return overlap > tolerance ? "overlap" : null;
  }
  const s = dot(cross(offset, v), normal) / denominator;
  const t = dot(cross(offset, u), normal) / denominator;
  if (
    s <= tolerance ||
    s >= la - tolerance ||
    t <= tolerance ||
    t >= lb - tolerance
  )
    return null;
  const p = add(a, scale(u, s)),
    q = add(c, scale(v, t));
  return distance(p, q) < tolerance ? scale(add(p, q), 0.5) : null;
}

/** An explicit crossing creates one editable joint. Only the chosen bars share it. */
export function connectMeshJoint(
  p: Project,
  memberId: string,
  target: { kind: "node" | "member"; id: string },
) {
  const member = p.members.find((m) => m.id === memberId);
  if (!member) throw new Error("Escolha a barra que receberá a conexão.");
  const nodes = new Map(p.nodes.map((n) => [n.id, n]));
  const a = nodes.get(member.start)!,
    b = nodes.get(member.end)!;
  const hosts = [member];
  let joint = nodes.get(target.id);
  if (target.kind === "member") {
    const other = p.members.find((m) => m.id === target.id);
    if (!other || other.id === member.id)
      throw new Error("Escolha duas barras distintas.");
    const point = crossing(
      a,
      b,
      nodes.get(other.start)!,
      nodes.get(other.end)!,
    );
    if (point === "overlap")
      throw new Error(
        "As barras são colineares e sobrepostas. Escolha um nó específico para conectar.",
      );
    if (!point)
      throw new Error(
        "As barras precisam se cruzar no interior dos dois segmentos em XYZ. Para um encontro em T, escolha o nó do montante.",
      );
    if (p.nodes.filter((n) => distance(n, point) < tolerance).length > 1)
      throw new Error(
        "Há mais de um nó no cruzamento. Resolva a duplicidade antes de conectar.",
      );
    joint = addPoint(p, point);
    hosts.push(other);
  }
  if (
    !joint ||
    hosts.some(
      (m) =>
        interiorParameter(joint!, nodes.get(m.start)!, nodes.get(m.end)!) ===
        null,
    )
  )
    throw new Error("Escolha um nó no interior da barra em XYZ.");
  const nodeId = joint.id;
  const additions = hosts.filter(
    (m) =>
      !p.meshConnections.some(
        (l) => l.memberId === m.id && l.nodeId === nodeId,
      ),
  );
  if (!additions.length) throw new Error("Essa conexão já existe.");
  p.meshConnections.push(...additions.map((m) => ({ memberId: m.id, nodeId })));
}

// Explicit bulk physical split retained for existing callers. Mesh connections use connectMeshJoint.
export function connectIntersections(p: Project) {
  const nodes = new Map(p.nodes.map((n) => [n.id, n]));
  const segments = p.members.map((m) => ({
    m,
    a: nodes.get(m.start)!,
    b: nodes.get(m.end)!,
  }));
  const initialNodes = p.nodes.length;
  for (let i = 0; i < segments.length; i++) {
    const first = segments[i];
    for (let j = i + 1; j < segments.length; j++) {
      const second = segments[j];
      const point = crossing(first.a, first.b, second.a, second.b);
      if (point === "overlap")
        throw new Error(
          `Barras sobrepostas: ${first.m.name} e ${second.m.name}. Ajuste a geometria antes de conectar.`,
        );
      if (point) {
        addPoint(p, point);
        if (p.nodes.length > 1000)
          throw new Error(
            "A conexão de interseções ultrapassa o limite de 1.000 nós.",
          );
      }
    }
  }
  const cuts = new Map<string, string[]>();
  for (const { m, a, b } of segments) {
    const interior = p.nodes
      .flatMap((n) => {
        if (n.id === a.id || n.id === b.id) return [];
        const t = interiorParameter(n, a, b);
        return t === null ? [] : [{ id: n.id, t }];
      })
      .sort((x, y) => x.t - y.t);
    if (interior.length)
      cuts.set(
        m.id,
        interior.map((n) => n.id),
      );
  }
  splitMembers(p, cuts);
  return { joints: p.nodes.length - initialNodes, divided: cuts.size };
}

// Cut nodes are ordered from i to j. The first span inherits the physical member ID.
export function splitMembers(p: Project, cuts: Map<string, string[]>) {
  const nodes = new Map(p.nodes.map((n) => [n.id, n]));
  const split = new Map<string, string[]>();
  let barCount = p.members.length;
  const usedNames = [...p.members];
  p.members = p.members.flatMap((m) => {
    const interior = cuts.get(m.id);
    if (!interior?.length) return [m];

    barCount += interior.length;
    if (barCount > 1000)
      throw new Error(
        "A conexão de interseções ultrapassa o limite de 1.000 barras.",
      );
    const joints = [m.start, ...interior, m.end];
    const children = joints.slice(0, -1).map((start, i) => {
      const child = {
        ...m,
        start,
        end: joints[i + 1],
        ...(m.stiffness ? { stiffness: { ...m.stiffness } } : {}),
      };
      splitOffsets(
        m,
        nodes.get(m.start)!,
        nodes.get(m.end)!,
        child,
        nodes.get(child.start)!,
        nodes.get(child.end)!,
      );
      if (i > 0) delete child.connectionI;
      if (i < joints.length - 2) delete child.connectionJ;
      const error = offsetError(
        child,
        nodes.get(child.start)!,
        nodes.get(child.end)!,
        p.mode,
      );
      if (error)
        throw new Error(
          `O corte precisa ficar no trecho deformável de ${m.name}. ${error}`,
        );
      if (i > 0) {
        child.id = uid();
        child.name = nextName("B", usedNames);
        usedNames.push(child);
      }
      return child;
    });
    const from = pointLoadFrame(m, nodes, p.mode);
    const targets = children.map((child) => ({
      child,
      frame: pointLoadFrame(child, nodes, p.mode),
    }));
    for (const pat of p.loadPatterns) {
      const field = pat.thermal?.find((f) => f.memberId === m.id);
      if (field) {
        const section = p.sections.find((s) => s.id === m.sectionId)!;
        pat.thermal = pat
          .thermal!.filter((f) => f.memberId !== m.id)
          .concat(
            targets.map(({ child, frame }) =>
              rebaseThermal(field, from.axes, frame.axes, child.id, section),
            ),
          );
      }
    }
    for (const pat of p.loadPatterns)
      if (pat.points)
        pat.points = pat.points.map((load) => {
          if (load.memberId !== m.id) return load;
          const point = actionPoint(load, from);
          // A load right at a physical cut belongs to the i-end of the following child.
          const dest =
            targets.find(
              ({ frame }) =>
                dot(subtract(point, frame.end), from.axes[0]) < -tolerance,
            ) ?? targets.at(-1)!;
          return rebasePointLoad(load, from, dest.frame, dest.child.id);
        });
    for (const pat of p.loadPatterns)
      if (pat.distributed)
        pat.distributed = pat.distributed.flatMap((load) => {
          if (load.memberId !== m.id) return [load];
          const pieces = targets.flatMap(({ child, frame }) => {
            const part = rebaseDistributedLoad(
              load,
              from,
              frame,
              child.id,
              true,
            );
            return part ? [part] : [];
          });
          return pieces.map((part, i) => (i ? { ...part, id: uid() } : part));
        });
    split.set(
      m.id,
      children.map((bar) => bar.id),
    );
    return children;
  });
  for (const pat of p.loadPatterns) {
    pat.uniform = pat.uniform.flatMap((l) =>
      (split.get(l.memberId) ?? [l.memberId]).map((memberId) => ({
        ...l,
        memberId,
      })),
    );
  }
  const byId = new Map(p.members.map((m) => [m.id, m]));
  p.meshConnections = p.meshConnections.flatMap((link) => {
    const children = split.get(link.memberId);
    if (!children) return [link];
    const n = nodes.get(link.nodeId)!;
    // A cut at the joint already connects both child endpoints.
    if (cuts.get(link.memberId)!.includes(n.id)) return [];
    const owner = children
      .map((id) => byId.get(id)!)
      .find(
        (m) =>
          interiorParameter(n, nodes.get(m.start)!, nodes.get(m.end)!) !== null,
      );
    if (!owner)
      throw new Error(
        `O corte deixaria a conexão de ${n.name} fora dos trechos. Revise o ponto de corte.`,
      );
    return [{ ...link, memberId: owner.id }];
  });
  remapGroups(p, "member", split);
  return split;
}

export function remapGroups(
  p: Project,
  kind: "member" | "node",
  replacements: Map<string, string[]>,
) {
  for (const group of p.selectionGroups) {
    const mapped = group.objects.flatMap((obj) =>
      obj.kind === kind && replacements.has(obj.id)
        ? replacements.get(obj.id)!.map((id) => ({ kind, id }))
        : [obj],
    );
    group.objects = [
      ...new Map(mapped.map((obj) => [selectionKey(obj), obj])).values(),
    ];
  }
}
