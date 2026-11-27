import { describe, expect, it } from "vitest";
import { addPolygonSlab, newSlabRing } from "../src/domain/editing";
import { createProject, type Project } from "../src/domain/model";
import {
  areaMapColor,
  buildAreaMap,
  comparisonAreas,
  comparisonModelKey,
  otherAreaPoint,
  probeArea,
  sharedLimits,
} from "../src/solver/areaMaps";
import { exportOofem, parseOofemOutput } from "../src/solver/oofem";
import {
  navierSlabCenter,
  slabBenchmarkProject,
} from "./fixtures/slab-benchmark";
import { cantileverPanel, foldedPanels } from "./fixtures/spatial-panels";
import { runDeck } from "./fixtures/solve-oofem";

function benchmarkSlab() {
  const p = slabBenchmarkProject();
  Object.assign(p.slabs[0], {
    formulation: "qdkt",
    divisionsX: 8,
    divisionsY: 6,
  });
  return p;
}

it("conserva somente a referência de um modelo físico e de cargas compatível", () => {
  const p = benchmarkSlab();
  const key = comparisonModelKey(p);
  Object.assign(p.slabs[0], { divisionsX: 16, divisionsY: 12 });
  expect(comparisonModelKey(p)).toBe(key);
  p.loadPatterns[0].pressure[0].pz *= 2;
  expect(comparisonModelKey(p)).not.toBe(key);

  const panel = cantileverPanel();
  const original = comparisonModelKey(panel);
  panel.surfacePanels![0].nu = 16;
  expect(comparisonModelKey(panel)).toBe(original);
  panel.surfacePanels![0].angleDeg = 30;
  expect(comparisonModelKey(panel)).not.toBe(original);
});

it("usa a mesma escala para valores constantes, seus extremos e ausência de resultados", () => {
  expect(sharedLimits([null, { faces: [], range: null }])).toBeNull();
  expect(sharedLimits([{ faces: [], range: [3, 3] }, null])).toEqual([3, 3]);
  expect(areaMapColor(3, [3, 3])).toBe(areaMapColor(0, [-1, 1]));
  expect(areaMapColor(-9, [-6, 3])).toBe(areaMapColor(-6, [-6, 3]));
  expect(areaMapColor(4, [-6, 3])).toBe(areaMapColor(3, [-6, 3]));
});

const executable = process.env.OOFEM_BIN;
function solve(p: Project, caseId = "EL") {
  const input = exportOofem(p, caseId);
  return parseOofemOutput(runDeck(input.deck, executable!), input);
}

describe.skipIf(!executable)(
  "KS-49 · recuperação de campos do OOFEM 3.0",
  () => {
    it("compara duas pressões e consulta a mesma posição em malhas QDKT distintas", () => {
      const p = benchmarkSlab();
      p.analysisCases.push({
        ...p.analysisCases[0],
        id: "P2",
        name: "Pressão dobrada",
        factors: [{ patternId: "G", factor: 2 }],
      });
      const [area] = comparisonAreas(p);
      const first = solve(p);
      const mapA = buildAreaMap(first, area, "uz", "smooth");
      const mapB = buildAreaMap(solve(p, "P2"), area, "uz", "smooth");
      const point = { x: 1.875, y: 1.375 };
      const [a] = probeArea(mapA, point);
      const [b] = probeArea(mapB, point);
      // Independent bilinear calculation. The point is at (3/4, 3/4)
      // in the cell above and to the right of node 22 (a 9-column layout).
      const [ll, lr, ul, ur] = [22, 23, 31, 32].map(
        (node) => first.slab!.nodes[node - 1].uz,
      );
      expect(a.value).toBeCloseTo((ll + 3 * lr + 3 * ul + 9 * ur) / 16, 12);
      expect(b.value).toBeCloseTo(2 * a.value!, 10);
      expect(sharedLimits([mapA, mapB])).toEqual(mapB!.range);
      expect(
        probeArea(buildAreaMap(first, area, "mx", "element"), {
          x: 2,
          y: 1.375,
        }),
      ).toHaveLength(2);

      Object.assign(p.slabs[0], { divisionsX: 16, divisionsY: 12 });
      const refined = buildAreaMap(solve(p), area, "uz", "smooth");
      const [c] = probeArea(refined, point);
      expect(refined!.faces).toHaveLength(192);
      expect(c.element).not.toBe(a.element);
      expect(Math.abs(c.value! - a.value!)).toBeLessThan(0.00003);
      expect(
        Math.abs(
          probeArea(refined, { x: 2, y: 1.5 })[0].value! -
            navierSlabCenter().uz,
        ),
      ).toBeLessThan(2e-6);
    });

    it("preserva o furo e localiza um ponto interior em duas malhas DKT", () => {
      const p = createProject("spatial");
      const ring = (points: number[][], supported: boolean) =>
        newSlabRing(
          points.map(([x, y]) => ({ x, y })),
          supported,
        );
      const slab = addPolygonSlab(p, "level1", [
        ring(
          [
            [0, 0],
            [5, 0],
            [5, 4],
            [0, 4],
          ],
          true,
        ),
        ring(
          [
            [1, 1],
            [2, 1],
            [2, 2],
            [1, 2],
          ],
          false,
        ),
      ]);
      p.loadPatterns[0].pressure = [{ slabId: slab.id, pz: -5000 }];
      const [area] = comparisonAreas(p);
      for (const refinements of [1, 2]) {
        slab.polygon.refinements = refinements;
        const map = buildAreaMap(solve(p), area, "my", "smooth");
        expect(probeArea(map, { x: 1.5, y: 1.5 })).toEqual([]);
        expect(probeArea(map, { x: 6, y: 1.5 })).toEqual([]);
        expect(
          Number.isFinite(probeArea(map, { x: 3.25, y: 2.35 })[0].value),
        ).toBe(true);
      }
    });

    it("preserva uma leitura local após girar o painel e distingue campo ausente", () => {
      const p = cantileverPanel("membrane", [
        { x: 1 / 3, y: 2 / 3, z: 2 / 3 },
        { x: 2 / 3, y: 1 / 3, z: -2 / 3 },
        { x: -2 / 3, y: 2 / 3, z: -1 / 3 },
      ]);
      const [area] = comparisonAreas(p);
      const result = solve(p);
      for (const method of ["element", "smooth"] as const) {
        const map = buildAreaMap(result, area, "nxx", method);
        const value = probeArea(map, { x: 1.82, y: 0.53 })[0].value!;
        for (const reading of [value, ...map!.range!])
          expect(Math.abs(reading - 100000)).toBeLessThan(12);
      }
      expect(buildAreaMap(result, area, "mxx", "smooth")).toBeNull();
      for (const sample of result.panels!.panels[0].samples)
        delete sample.fields.nxx;
      const missing = buildAreaMap(result, area, "nxx", "smooth");
      expect(missing!.range).toBeNull();
      expect(probeArea(missing, { x: 1.82, y: 0.53 })[0].value).toBeUndefined();
    });

    it("consulta as duas faces de uma dobra sem suavizar de um painel para outro", () => {
      const p = foldedPanels();
      const [wall, slab] = comparisonAreas(p);
      const point = { x: 3, y: 0.6 },
        projected = otherAreaPoint(wall, point, slab)!;
      expect(projected).toMatchObject({ x: 0, y: 0.6 });
      expect(otherAreaPoint(wall, { x: 2, y: 0.6 }, slab)).toBeNull();
      const result = solve(p);
      for (const [area, at] of [
        [wall, point],
        [slab, projected],
      ] as const)
        expect(
          probeArea(buildAreaMap(result, area, "mxx", "smooth"), at).length,
        ).toBeGreaterThan(0);
    });
  },
);
