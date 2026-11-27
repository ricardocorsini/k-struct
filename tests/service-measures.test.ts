import { describe, expect, it } from "vitest";
import {
  beamExample,
  createProject,
  free,
  parseProject,
  serializeProject,
  type ServiceMeasure,
} from "../src/domain/model";
import { reverseMember } from "../src/domain/editing";
import { setPrescribedMotion } from "../src/domain/prescribedMotions";
import { evaluateServiceMeasure } from "../src/solver/serviceMeasures";
import {
  exportOofem,
  parseOofemOutput,
  type AnalysisResult,
  type Displacement,
  type Station,
} from "../src/solver/oofem";
import { runDeck } from "./fixtures/solve-oofem";

const blank: Displacement = { ux: 0, uy: 0, uz: 0, rx: 0, ry: 0, rz: 0 };
const blankSection = {
  ...blank,
  n: 0,
  v: 0,
  m: 0,
  vy: 0,
  vz: 0,
  mx: 0,
  my: 0,
  mz: 0,
};
const chord = {
  id: "measure",
  name: "Viga em serviço",
  kind: "chord",
  axis: "z",
  memberId: "V1",
  t: 0.5,
  source: { kind: "case", id: "EL" },
} as const satisfies ServiceMeasure;
const drift = {
  id: "drift",
  name: "Entre pavimentos",
  kind: "drift",
  axis: "x",
  a: "A",
  b: "B",
  source: { kind: "case", id: "EL" },
} as const satisfies ServiceMeasure;

function answer(
  caseId: string,
  displacements: AnalysisResult["displacements"],
  members: Record<string, Station[]> = {},
): AnalysisResult {
  return {
    caseId,
    displacements,
    members,
    reactions: [],
    solver: "Referência analítica",
    completedAt: "",
    rawOutput: "",
  };
}

function levels() {
  const p = createProject("spatial");
  p.nodes = [
    { id: "A", name: "Inferior", x: 4, y: 0, z: 0, restraints: free() },
    { id: "B", name: "Superior", x: 4, y: 0, z: 3, restraints: free() },
  ];
  return p;
}

it("mede 12 mm e 0,4% entre níveis a 3 m e cancela a translação rígida", () => {
  const p = levels();
  const current = (top: number) =>
    new Map([
      [
        "EL",
        answer("EL", { A: { ...blank, ux: 0.005 }, B: { ...blank, ux: top } }),
      ],
    ]);
  const { max, geometry } = evaluateServiceMeasure(p, drift, current(0.017));
  expect(geometry.referenceLength).toBe(3);
  expect(max.delta).toBeCloseTo(0.012, 15);
  expect(max.ratio).toBeCloseTo(0.004, 15);
  expect(evaluateServiceMeasure(p, drift, current(0.005)).max.ratio).toBe(0);
  p.nodes[1].z = 0;
  expect(() => evaluateServiceMeasure(p, drift, current(0.017))).toThrow(
    /Altura nula/,
  );
});

it("desconta a corda de −4 mm da seção de −12 mm e interpola entre estações", () => {
  const p = beamExample();
  const sampled = [
    { ...blankSection, t: 0, uz: -0.002 },
    { ...blankSection, t: 0.5, uz: -0.012 },
    { ...blankSection, t: 1, uz: -0.006 },
  ];
  const r = evaluateServiceMeasure(
    p,
    chord,
    new Map([["EL", answer("EL", {}, { V1: sampled })]]),
  ).max;
  expect(r.absolute).toBe(-0.012);
  expect(r.reference).toBe(-0.004);
  expect(r.delta).toBe(-0.008);

  // A common rotation about Y and translation form a straight deformed axis.
  const rotating = [
    { ...blankSection, t: 0, uz: -0.002, ry: 0.001 },
    { ...blankSection, t: 1, uz: -0.008, ry: 0.001 },
  ];
  const rigid = evaluateServiceMeasure(
    p,
    { ...chord, t: 0.37 },
    new Map([["EL", answer("EL", {}, { V1: rotating })]]),
  ).max;
  expect(rigid.delta).toBeCloseTo(0, 14);
  expect(rigid.method).toContain("Interpolação cúbica");
});

it("identifica o governante depois de calcular cada combinação completa", () => {
  const p = levels();
  p.analysisCases.push({ ...p.analysisCases[0], id: "CP" });
  p.resultCombinations = [
    {
      id: "C1",
      name: "C1",
      type: "linear",
      factors: [{ caseId: "EL", factor: 1 }],
    },
    {
      id: "C2",
      name: "C2",
      type: "linear",
      factors: [{ caseId: "CP", factor: 2 }],
    },
  ];
  p.resultEnvelopes = [
    { id: "E1", name: "Envoltória", combinationIds: ["C1", "C2"] },
  ];
  const sources = new Map([
    [
      "EL",
      answer("EL", {
        A: { ...blank, ux: 0.005, uy: 0.008 },
        B: { ...blank, ux: 0.017, uy: 0.001 },
      }),
    ],
    [
      "CP",
      answer("CP", {
        A: { ...blank, ux: 0.01, uy: 0 },
        B: { ...blank, ux: 0.006, uy: 0.005 },
      }),
    ],
  ]);
  const measurement = {
    ...drift,
    source: { kind: "envelope" as const, id: "E1" },
  };
  const x = evaluateServiceMeasure(p, measurement, sources);
  expect(x.max).toMatchObject({ id: "C1", a: 0.005, b: 0.017 });
  expect(x.max.delta).toBeCloseTo(0.012, 15);
  expect(x.min).toMatchObject({ id: "C2", a: 0.02, b: 0.012, delta: -0.008 });
  expect(
    evaluateServiceMeasure(p, { ...measurement, axis: "y" }, sources).max,
  ).toMatchObject({ id: "C2", delta: 0.01 });
  const difference = evaluateServiceMeasure(
    p,
    { ...measurement, kind: "difference" },
    sources,
  );
  expect(difference.max).toMatchObject({ id: "C1", ratio: null });
  sources.delete("CP");
  expect(() => evaluateServiceMeasure(p, measurement, sources)).toThrow(
    /casos pendentes/,
  );
});

it("migra o esquema v32, persiste a medida e conserva a posição ao inverter a barra", () => {
  const p = beamExample();
  const old = JSON.stringify({ ...p, schemaVersion: 32 });
  expect(parseProject(old)).toEqual(p);
  p.serviceMeasures = [{ ...chord, t: 0.25 }];
  reverseMember(p, "V1");
  const saved = parseProject(serializeProject(p));
  expect(saved.serviceMeasures).toEqual([{ ...chord, t: 0.75 }]);
});

describe.skipIf(!process.env.OOFEM_BIN)(
  "KS-50 · referências com OOFEM 3.0",
  () => {
    it.each([3, 8])(
      "desconta os recalques de uma viga de 6 m com %i segmentos",
      (segments) => {
        const p = beamExample();
        p.mesh.segmentsPerMember = segments;
        setPrescribedMotion(p.loadPatterns[0], {
          nodeId: "A",
          dof: "uz",
          value: -0.002,
        });
        setPrescribedMotion(p.loadPatterns[0], {
          nodeId: "B",
          dof: "uz",
          value: -0.006,
        });
        const input = exportOofem(p, "EL");
        const result = parseOofemOutput(
          runDeck(input.deck, process.env.OOFEM_BIN!),
          input,
        );
        const r = evaluateServiceMeasure(
          p,
          chord,
          new Map([["EL", result]]),
        ).max;
        const EI = (200e9 * 0.15 * 0.2 ** 3) / 12;
        const analytic = (-5 * 10000 * 6 ** 4) / (384 * EI);
        const interpolation =
          segments % 2 ? (10000 * (6 / segments) ** 4) / (384 * EI) : 0;
        expect(r.reference).toBeCloseTo(-0.004, 10);
        expect(r.delta).toBeCloseTo(analytic + interpolation, 9);
        expect(r.absolute).toBeCloseTo(-0.004 + analytic + interpolation, 9);
      },
    );
  },
);
