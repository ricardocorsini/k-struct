import { describe, expect, it } from "vitest";
import {
  beamExample,
  parseProject,
  serializeProject,
} from "../src/domain/model";
import { exportOofem } from "../src/solver/oofem";
import { exportSlab } from "../src/solver/slab";
import { selfWeightSummary } from "../src/domain/selfWeight";
import { slabBenchmarkProject } from "./fixtures/slab-benchmark";

describe("peso próprio por padrão", () => {
  it("calcula a carga da barra pela área bruta e mantém o deck sem carga manual", () => {
    const project = beamExample();
    project.materials[0].density = 2500;
    Object.assign(project.sections[0], { width: 0.2, height: 0.4 });
    project.loadPatterns[0].uniform = [];
    Object.assign(project.loadPatterns[0].selfWeight, {
      enabled: true,
      gravity: 10,
      multiplier: 1,
      direction: "-Z",
    });

    const summary = selfWeightSummary(project, project.loadPatterns[0]);
    expect(summary.members).toHaveLength(1);
    expect(summary.members[0]).toMatchObject({ memberId: "V1" });
    expect(summary.members[0].qz).toBeCloseTo(-2000, 8);
    expect(summary.members[0].totalZ).toBeCloseTo(-12000, 8);
    expect(summary.warnings).toEqual([]);
    const input = exportOofem(project, "EL");
    expect(input.deck).toContain("ConstantEdgeLoad");
    expect(input.deck).toContain("-2000");
    expect(input.deck).not.toContain("-10000");
  });

  it("soma a gravidade automática à pressão da laje e fecha a carga total", () => {
    const project = slabBenchmarkProject();
    const slab = project.slabs[0];
    project.materials.find(({ id }) => id === slab.materialId)!.density = 2500;
    Object.assign(project.loadPatterns[0].selfWeight, {
      enabled: true,
      direction: "-Z",
      gravity: 10,
      multiplier: 1,
    });
    project.loadPatterns[0].pressure = [];

    const result = exportSlab(project, project.analysisCases[0], slab);
    expect(result.slab.totalLoadZ).toBe(-30_000);
    expect(result.deck).toContain("-625");
  });

  it("avisa sobre possível duplicação manual e soma de padrões", () => {
    const project = beamExample();
    Object.assign(project.loadPatterns[0].selfWeight, { enabled: true });
    project.loadPatterns[0].uniform[0].qz = -1000;
    const duplicate = selfWeightSummary(project, project.loadPatterns[0]);
    expect(duplicate.warnings.join(" ")).toMatch(/cargas manuais/);

    project.loadPatterns.push({
      ...project.loadPatterns[0],
      id: "G2",
      name: "Outra carga permanente",
      selfWeight: { ...project.loadPatterns[0].selfWeight },
    });
    project.analysisCases[0].factors.push({ patternId: "G2", factor: 1 });
    const multiple = selfWeightSummary(project, project.loadPatterns[0]);
    expect(multiple.warnings.join(" ")).toMatch(/será somada duas vezes/);
  });

  it("desconsidera totalmente o fator zero para o peso próprio horizontal do painel", () => {
    const p = slabBenchmarkProject(),
      pat = p.loadPatterns[0];
    p.loadPatterns.push({
      ...structuredClone(pat),
      id: "H",
      selfWeight: { ...pat.selfWeight, enabled: true, direction: "+X" },
    });
    const original = exportOofem(p, "EL").deck;
    p.analysisCases[0].factors.push({ patternId: "H", factor: 0 });
    expect(exportOofem(p, "EL").deck).toBe(original);
  });

  it("migra projetos v19 sem alterar as cargas existentes", () => {
    const project = beamExample();
    const old = {
      ...project,
      schemaVersion: 19,
      loadPatterns: project.loadPatterns.map(({ selfWeight, ...pattern }) => {
        void selfWeight;
        return pattern;
      }),
    };
    const migrated = parseProject(JSON.stringify(old));
    expect(migrated.schemaVersion).toBe(33);
    expect(migrated.loadPatterns[0].uniform).toEqual(
      project.loadPatterns[0].uniform,
    );
    expect(migrated.loadPatterns[0].selfWeight).toEqual({
      enabled: false,
      direction: "-Z",
      gravity: 9.80665,
      multiplier: 1,
    });
    expect(parseProject(serializeProject(migrated))).toEqual(migrated);
  });

  it("recusa peso próprio fora dos graus de liberdade representados", () => {
    const project = beamExample();
    Object.assign(project.loadPatterns[0].selfWeight, {
      enabled: true,
      direction: "+Y",
    });
    expect(() => exportOofem(project, "EL")).toThrow(/fora do plano XZ/);
  });
});
