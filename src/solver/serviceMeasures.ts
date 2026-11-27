import {
  add,
  cross,
  distance,
  dot,
  interpolate,
  length,
  scale,
  subtract,
  tolerance,
  type Point3,
} from "../domain/geometry";
import { memberAxis } from "../domain/memberOffsets";
import type { Project, ServiceMeasure, StructuralNode } from "../domain/model";
import { requireAvailableCases } from "./combinations";
import { envelopeCombinations } from "./envelopes";
import type { AnalysisResult, Displacement, Station } from "./oofem";

const translation = ({ ux, uy, uz }: Displacement): Point3 => ({
  x: ux,
  y: uy,
  z: uz,
});
const rotation = ({ rx, ry, rz }: Displacement): Point3 => ({
  x: rx,
  y: ry,
  z: rz,
});

export function serviceGeometry(project: Project, measure: ServiceMeasure) {
  if (project.mode === "planar" && measure.axis === "y")
    throw new Error("A direção Y exige um modelo XYZ.");
  if (measure.kind === "chord") {
    const member = project.members.find(({ id }) => id === measure.memberId);
    const a = project.nodes.find(({ id }) => id === member?.start);
    const b = project.nodes.find(({ id }) => id === member?.end);
    if (!member || !a || !b)
      throw new Error("Selecione uma barra existente para definir a corda.");
    const line = memberAxis(member, a, b);
    const span = subtract(line.faceJ, line.faceI);
    if (
      !Number.isFinite(line.clear) ||
      line.clear < tolerance ||
      length(span) < tolerance
    )
      throw new Error(
        "A corda exige um trecho deformável com comprimento positivo.",
      );
    if (!Number.isFinite(measure.t) || measure.t < 0 || measure.t > 1)
      throw new Error(
        "Informe uma posição entre 0 e 100% do trecho deformável.",
      );
    return {
      kind: "chord" as const,
      a,
      b,
      from: line.faceI,
      to: line.faceJ,
      position: interpolate(line.faceI, line.faceJ, measure.t),
      referenceLength: line.clear,
      tangent: scale(span, 1 / length(span)),
    };
  }
  const a = project.nodes.find(({ id }) => id === measure.a);
  const b = project.nodes.find(({ id }) => id === measure.b);
  if (!a || !b || a.id === b.id)
    throw new Error("Selecione dois nós distintos e existentes.");
  const referenceLength = measure.kind === "drift" ? b.z - a.z : distance(a, b);
  if (measure.kind === "drift" && Math.abs(referenceLength) < tolerance)
    throw new Error(
      "Altura nula entre os pontos de referência. Escolha nós em cotas diferentes.",
    );
  if (!Number.isFinite(referenceLength) || referenceLength < tolerance)
    throw new Error(
      measure.kind === "drift"
        ? "O nó superior deve estar acima do nó inferior."
        : "A distância de referência entre os nós deve ser positiva.",
    );
  return {
    kind: "nodes" as const,
    a,
    b,
    from: a,
    to: b,
    position: b,
    referenceLength,
  };
}

function sectionTranslation(
  stations: Station[],
  t: number,
  span: number,
  tangent: Point3,
) {
  const index = stations.findIndex((station) => station.t >= t);
  const right = stations[index];
  if (!right)
    throw new Error("Faltam deslocamentos da seção na revisão atual.");
  if (right.t === t)
    return { value: translation(right), method: "Estação calculada" as const };
  const left = stations[index - 1];
  if (!left) throw new Error("Faltam deslocamentos da seção na revisão atual.");
  const u = (t - left.t) / (right.t - left.t);
  const chord = interpolate(translation(left), translation(right), u);
  const h = (right.t - left.t) * span;
  const inner = add(
    scale(translation(left), (1 - u) ** 2 * (1 + 2 * u)),
    scale(translation(right), u * u * (3 - 2 * u)),
  );
  const hermite = add(
    inner,
    add(
      scale(cross(rotation(left), tangent), h * u * (1 - u) ** 2),
      scale(cross(rotation(right), tangent), -h * u * u * (1 - u)),
    ),
  );
  // The element uses linear axial interpolation and cubic transverse interpolation.
  return {
    value: add(hermite, scale(tangent, dot(subtract(chord, hermite), tangent))),
    method: "Interpolação cúbica no elemento" as const,
  };
}

type Geometry = ReturnType<typeof serviceGeometry>;
function projectReading(
  measure: ServiceMeasure,
  geometry: Geometry,
  result: AnalysisResult,
) {
  const key = `u${measure.axis}` as const;
  if (measure.kind === "chord" && geometry.kind === "chord") {
    const stations = result.members[measure.memberId];
    const a = stations?.[0],
      b = stations?.at(-1);
    if (!a || !b || a.t !== 0 || b.t !== 1)
      throw new Error(
        "Faltam deslocamentos nas faces da barra na revisão atual.",
      );
    const { value, method } = sectionTranslation(
      stations,
      measure.t,
      geometry.referenceLength,
      geometry.tangent,
    );
    return {
      a: a[key],
      b: b[key],
      absolute: value[measure.axis],
      reference: (1 - measure.t) * a[key] + measure.t * b[key],
      method,
    };
  }
  const at = (node: StructuralNode) => result.displacements[node.id]?.[key];
  const a = at(geometry.a),
    b = at(geometry.b);
  if (a === undefined || b === undefined)
    throw new Error(
      "Faltam deslocamentos dos nós de referência na revisão atual.",
    );
  return {
    a,
    b,
    absolute: b,
    reference: a,
    method: "Deslocamentos nodais" as const,
  };
}

export function evaluateServiceMeasure(
  project: Project,
  measure: ServiceMeasure,
  cases: ReadonlyMap<string, AnalysisResult>,
) {
  const geometry = serviceGeometry(project, measure);
  const { source } = measure;
  const caseItem =
    source.kind === "case" &&
    project.analysisCases.find(({ id }) => id === source.id);
  const combination =
    source.kind === "combination" &&
    project.resultCombinations.find(({ id }) => id === source.id);
  const envelope =
    source.kind === "envelope" &&
    project.resultEnvelopes.find(({ id }) => id === source.id);
  const definitions = caseItem
    ? [
        {
          id: caseItem.id,
          name: caseItem.name,
          factors: [{ caseId: caseItem.id, factor: 1 }],
        },
      ]
    : combination
      ? [combination]
      : envelope
        ? envelopeCombinations(project, envelope)
        : [];
  if (!definitions.length)
    throw new Error("Escolha um caso, combinação ou envelope existente.");
  requireAvailableCases(
    project,
    definitions.flatMap(({ factors }) => factors),
    cases,
  );
  const readings = new Map<string, ReturnType<typeof projectReading>>();
  for (const { factors } of definitions)
    for (const { caseId, factor } of factors)
      if (factor !== 0 && !readings.has(caseId))
        readings.set(
          caseId,
          projectReading(measure, geometry, cases.get(caseId)!),
        );

  const results = definitions.map(({ id, name, factors }) => {
    let a = 0,
      b = 0,
      absolute = 0,
      reference = 0,
      delta = 0;
    let method: ReturnType<typeof projectReading>["method"] =
      "Deslocamentos nodais";
    for (const { caseId, factor } of factors) {
      if (factor === 0) continue;
      const reading = readings.get(caseId)!;
      method = reading.method;
      a += factor * reading.a;
      b += factor * reading.b;
      absolute += factor * reading.absolute;
      reference += factor * reading.reference;
      delta += factor * (reading.absolute - reading.reference);
    }
    const ratio =
      measure.kind === "drift" ? delta / geometry.referenceLength : null;
    if (![a, b, absolute, reference, delta, ratio ?? 0].every(Number.isFinite))
      throw new Error("A medida excede o intervalo numérico.");
    return { id, name, a, b, absolute, reference, delta, ratio, method };
  });
  let min = results[0],
    max = results[0];
  for (const item of results) {
    if (item.delta < min.delta) min = item;
    if (item.delta > max.delta) max = item;
  }
  return { geometry, results, min, max };
}
