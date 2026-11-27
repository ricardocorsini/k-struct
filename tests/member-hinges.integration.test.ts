import { describe, expect, it } from "vitest";
import { hingeMemberEnds } from "../src/domain/editing";
import {
  defaultEndConnection,
  type Project,
  uniformLoad,
} from "../src/domain/model";
import { exportOofem, parseOofemOutput } from "../src/solver/oofem";
import { planarTruss, spatialBrace } from "./fixtures/member-hinges";
import { runDeck } from "./fixtures/solve-oofem";

it("articula apenas as barras escolhidas e preserva os vínculos de translação", () => {
  const project = spatialBrace();
  const brace = project.members[1];
  const baseline = structuredClone(project);
  brace.connectionI = {
    ...defaultEndConnection(),
    ux: { kind: "elastic", stiffness: 5000 },
  };
  brace.connectionJ = { ...defaultEndConnection(), rx: { kind: "free" } };
  hingeMemberEnds(project, new Set(["BC"]));
  expect(brace.connectionI).toEqual({
    ...defaultEndConnection(),
    ux: { kind: "elastic", stiffness: 5000 },
    rx: { kind: "free" },
    ry: { kind: "free" },
    rz: { kind: "free" },
  });
  expect(brace.connectionJ).toEqual({
    ...defaultEndConnection(),
    ry: { kind: "free" },
    rz: { kind: "free" },
  });
  const { connectionI: _i, connectionJ: _j, ...geometry } = brace;
  expect({ ...project, members: [project.members[0], geometry] }).toEqual(
    baseline,
  );
});

const executable = process.env.OOFEM_BIN;
function solve(project: Project) {
  const input = exportOofem(project, "EL");
  return parseOofemOutput(runDeck(input.deck, executable!), input);
}

describe.skipIf(!executable)(
  "KS-22 · atalhos de articulação no OOFEM 3.0",
  () => {
    it("reproduz a treliça plana com a carga nodal de referência", () => {
      const project = planarTruss();
      hingeMemberEnds(project, new Set(project.members.map(({ id }) => id)));
      const result = solve(project);
      for (const nodeId of ["A", "B"])
        expect(
          result.reactions.find((row) => row.nodeId === nodeId)?.fz,
        ).toBeCloseTo(5000, 0);
      expect(result.displacements.C.uz).toBeCloseTo(-0.0002375, 10);
      for (const [id, normal] of [
        ["V1", 3750],
        ["AC", -6250],
        ["BC", -6250],
      ] as const)
        for (const station of result.members[id]) {
          expect(station.n).toBeCloseTo(normal, 0);
          expect(station.v).toBeCloseTo(0, 0);
          expect(station.my).toBeCloseTo(0, 0);
        }
    });

    it.each([2, 8])(
      "preserva a flexão do banzo sob carga transversal com %i segmentos",
      (segments) => {
        const project = planarTruss();
        hingeMemberEnds(project, new Set(project.members.map(({ id }) => id)));
        project.loadPatterns[0].nodal = [];
        project.loadPatterns[0].uniform = [
          { ...uniformLoad("V1"), qz: -10000 },
        ];
        project.mesh.segmentsPerMember = segments;
        const result = solve(project);
        for (const nodeId of ["A", "B"])
          expect(
            result.reactions.find((row) => row.nodeId === nodeId)?.fz,
          ).toBeCloseTo(30000, 0);
        const stations = result.members.V1;
        expect(stations[0].my).toBeCloseTo(0, 0);
        expect(stations.at(-1)!.my).toBeCloseTo(0, 0);
        expect(stations[0].v).toBeCloseTo(30000, 0);
        expect(stations.at(-1)!.v).toBeCloseTo(-30000, 0);
        const middle = stations.find(({ t }) => t === 0.5)!;
        expect(middle.my).toBeCloseTo(45000, 0);
        expect(middle.uz).toBeCloseTo(-0.03375, 8);
      },
    );

    it("conserva as rotações do pórtico espacial no nó ligado à barra articulada", () => {
      const project = spatialBrace();
      hingeMemberEnds(project, new Set(["BC"]));
      const result = solve(project);
      const b = result.displacements.B;
      expect(b.uy).toBeCloseTo(0.000127729257642, 9);
      expect(b.uz).toBeCloseTo(-0.0027, 9);
      expect(b.rx).toBeCloseTo(0.000351, 9);
      expect(b.ry).toBeCloseTo(0.00135, 9);
      expect(b.rz).toBeCloseTo(0.000345114628821, 9);
      for (const station of result.members.BC) {
        expect(station.n).toBeCloseTo(-12772.925764192, 0);
        for (const moment of [station.mx, station.my, station.mz])
          expect(moment).toBeCloseTo(0, 0);
      }
    });
  },
);
