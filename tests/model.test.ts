import { projectV8 } from "./fixtures/project-v8";
import { describe, expect, it } from "vitest";
import {
  addPoint,
  analysisErrors,
  beamExample,
  createProject,
  parseProject,
  removeSelection,
  serializeProject,
  type Project,
} from "../src/domain/model";
import { meshSlab } from "../src/domain/slab";
import { parseSlabOutput } from "../src/solver/slab";
import { historyReducer } from "../src/domain/history";
import { exportOofem, parseOofemOutput } from "../src/solver/oofem";
import {
  addMember,
  connectIntersections,
  replicate,
} from "../src/domain/editing";
import { nodalLoad, uniformLoad } from "../src/domain/model";
import { slabBenchmarkProject } from "./fixtures/slab-benchmark";

function beforeSlabs(current: Project) {
  const { meshConnections, selectionGroups, slabs, loadPatterns, ...project } =
    projectV8(current);
  return {
    ...project,
    loadPatterns: loadPatterns.map(({ pressure, ...pattern }) => pattern),
  };
}

describe("projeto versionado e edição", () => {
  it("salva e reabre sem alterar IDs, unidades ou cargas", () => {
    const p = beamExample();
    expect(parseProject(serializeProject(p))).toEqual(p);
  });
  it("migra o arquivo gerado pela versão 0.2 com o contrato plano original", () => {
    const { mode, guides, resultCombinations, resultEnvelopes, ...current } =
      beforeSlabs(beamExample());
    const legacy = {
      ...current,
      schemaVersion: 1,
      nodes: current.nodes.map(({ restraints: { ux, uz, ry }, ...node }) => ({
        ...node,
        restraints: { ux, uz, ry },
      })),
      members: current.members.map(({ roll, ...bar }) => bar),
      loadPatterns: [
        {
          id: "G",
          name: "Carga permanente",
          nodal: [{ nodeId: "B", fx: 0, fz: -700, my: 230 }],
          uniform: [{ memberId: "V1", qx: 0, qz: -10000 }],
        },
      ],
    };
    const p = parseProject(JSON.stringify(legacy));
    expect(p.mode).toBe("planar");
    expect(p.schemaVersion).toBe(33);
    expect(p.resultCombinations).toEqual([]);
    expect(p.resultEnvelopes).toEqual([]);
    expect(p.nodes.map((n) => n.id)).toEqual(["A", "B"]);
    expect(p.members[0]).toMatchObject({ id: "V1", roll: 0 });
    expect(p.loadPatterns[0].nodal[0]).toEqual({
      ...nodalLoad("B"),
      fz: -700,
      my: 230,
    });
    expect(exportOofem(p, "EL").deck).toContain("domain 2dBeam");
  });
  it("migra o esquema v2 preservando os casos e inicia a lista de combinações vazia", () => {
    const project = createProject("spatial");
    project.analysisCases[0].factors[0].factor = -0.75;
    const { resultCombinations, resultEnvelopes, ...old } =
      beforeSlabs(project);
    expect(parseProject(JSON.stringify({ ...old, schemaVersion: 2 }))).toEqual(
      project,
    );
  });
  it("migra o esquema v3 preservando combinações e salva envelopes pelo ID das combinações", () => {
    const project = beamExample();
    project.resultCombinations.push({
      id: "C1",
      name: "Combinação",
      type: "linear",
      factors: [{ caseId: "EL", factor: 1 }],
    });
    const { resultEnvelopes, ...old } = beforeSlabs(project);
    expect(parseProject(JSON.stringify({ ...old, schemaVersion: 3 }))).toEqual(
      project,
    );
    const envelope = {
      id: "E1",
      name: "Envelope de teste",
      combinationIds: ["C1"],
    };
    project.resultEnvelopes = [envelope];
    expect(
      parseProject(
        JSON.stringify({ ...beforeSlabs(project), schemaVersion: 4 }),
      ),
    ).toEqual(project);
    expect(parseProject(serializeProject(project))).toEqual(project);
    envelope.combinationIds.push("C1");
    expect(() => parseProject(serializeProject(project))).toThrow(
      /uma única vez/,
    );
    envelope.combinationIds = ["C1"];
    project.resultCombinations = [];
    expect(() => parseProject(serializeProject(project))).toThrow(
      /combinação inexistente/,
    );
  });
  it("persiste combinações e rejeita parcelas órfãs, repetidas ou todas nulas", () => {
    const p = beamExample();
    p.resultCombinations.push({
      id: "C1",
      name: "Combinação 1",
      type: "linear",
      factors: [{ caseId: "EL", factor: -1.5 }],
    });
    const [combination] = p.resultCombinations;
    expect(parseProject(serializeProject(p))).toEqual(p);
    combination.factors.push({ caseId: "EL", factor: 0.5 });
    expect(() => parseProject(serializeProject(p))).toThrow(/única parcela/);
    combination.factors = [{ caseId: "EL", factor: 0 }];
    expect(() => parseProject(serializeProject(p))).toThrow(
      /diferente de zero/,
    );
    combination.factors = [{ caseId: "excluido", factor: 1 }];
    expect(() => parseProject(serializeProject(p))).toThrow(
      /caso estático inexistente/,
    );
  });
  it("recusa versões futuras, propriedades estranhas e referências quebradas", () => {
    const p = beamExample();
    expect(() =>
      parseProject(
        JSON.stringify({ ...p, schemaVersion: p.schemaVersion + 1 }),
      ),
    ).toThrow();
    expect(() =>
      parseProject(JSON.stringify({ ...p, executable: "/tmp/code" })),
    ).toThrow();
    p.members[0].start = "missing";
    expect(() => parseProject(JSON.stringify(p))).toThrow(/inexistente/);
  });
  it("remove cargas e barras dependentes ao remover um nó e desfaz integralmente", () => {
    const p = beamExample(),
      next = structuredClone(p);
    removeSelection(next, [{ kind: "node", id: "A" }]);
    expect(next.members).toHaveLength(0);
    expect(next.loadPatterns[0].uniform).toHaveLength(0);
    const h = historyReducer(
      { past: [], current: p, future: [] },
      { type: "change", project: next },
    );
    expect(historyReducer(h, { type: "undo" }).current).toEqual(p);
    expect(
      historyReducer(historyReducer(h, { type: "undo" }), { type: "redo" })
        .current,
    ).toEqual(next);
  });
  it("reutiliza o mesmo nó no snap e não cria duplicatas", () => {
    const p = createProject();
    const point = { x: 3, y: 0, z: 2 };
    const first = addPoint(p, point);
    expect(addPoint(p, point).id).toBe(first.id);
    expect(p.nodes).toHaveLength(1);
  });
});

describe("laje retangular isolada", () => {
  it("migra os dois formatos v5 e mantém a cota livre e as pressões por padrão", () => {
    const original = slabBenchmarkProject();
    const { formulation, ...triangle } = original.slabs[0];
    const { selectionGroups, meshConnections, ...legacy } = projectV8(original);
    const v5 = { ...legacy, schemaVersion: 5, slabs: [triangle] };
    expect(parseProject(JSON.stringify(v5))).toEqual(original);
    const { levelId, divisionsX, divisionsY, ...geometry } = triangle;
    const quadV5 = {
      ...v5,
      slabs: [{ ...geometry, z: 1.25, nx: divisionsX, ny: divisionsY }],
      loadPatterns: original.loadPatterns.map(
        ({ pressure, selfWeight, ...pattern }) => {
          void selfWeight;
          return {
            ...pattern,
            pressures: pressure.map(({ slabId, pz }) => ({ slabId, qz: pz })),
          };
        },
      ),
    };
    const imported = parseProject(JSON.stringify(quadV5));
    const [panel] = imported.slabs;
    expect(panel.formulation).toBe("qdkt");
    expect(
      imported.guides.z.find((level) => level.id === panel.levelId)?.position,
    ).toBe(1.25);
    expect(imported.loadPatterns).toEqual(original.loadPatterns);
    expect(parseProject(serializeProject(imported))).toEqual(imported);
    expect(exportOofem(imported, "EL").deck).toContain(
      "qdktplate 1 nodes 4 11 10 1 2",
    );
    if (panel.polygon)
      throw new Error("O painel legado deve preservar a malha retangular.");
    panel.supports.xMin = false;
    expect(analysisErrors(imported).join(" ")).toMatch(/quatro bordas/);
  });
  it("persiste a laje, referências e pressão e exclui a carga dependente", () => {
    const p = slabBenchmarkProject();
    const [slab] = p.slabs;
    slab.divisionsX = 16;
    slab.supports.yMax = false;
    expect(parseProject(serializeProject(p))).toEqual(p);
    const input = exportOofem(p, "EL");
    expect(exportOofem(parseProject(serializeProject(p)), "EL").deck).toBe(
      input.deck,
    );
    removeSelection(p, [{ kind: "slab", id: slab.id }]);
    expect(p.slabs).toEqual([]);
    expect(p.loadPatterns[0].pressure).toEqual([]);
  });

  it("recupera exatamente campos lineares de momentos nos vértices DKT", () => {
    const project = slabBenchmarkProject();
    project.loadPatterns[0].pressure = [];
    Object.assign(project.slabs[0], { divisionsX: 2, divisionsY: 2 });
    const input = exportOofem(project, "EL").slab!;
    const { nodes, elements } = input.mesh;
    const mx = (x: number, y: number) => 7 + 2 * x - 3 * y;
    const my = (x: number, y: number) => -4 + 5 * x + y;
    const coordinates = [
      [1 / 6, 1 / 6],
      [2 / 3, 1 / 6],
      [1 / 6, 2 / 3],
    ];
    const raw = elements
      .map((element) => {
        const [a, b, c] = element.nodes.map((id) => nodes[id - 1]);
        const stresses = coordinates.map(([l1, l2], i) => {
          const l3 = 1 - l1 - l2;
          const x = l1 * a.x + l2 * b.x + l3 * c.x;
          const y = l1 * a.y + l2 * b.y + l3 * c.y;
          return ` GP 1.${i + 1} :
  stresses 0 0 0 ${-mx(x, y)} ${-my(x, y)} 0 0 0`;
        });
        return [
          `element ${element.number} (${element.number}):`,
          ...stresses,
        ].join("\n");
      })
      .join("\n");
    const dofs = new Map(
      nodes.map((node) => [
        node.number,
        new Map([
          [3, 0],
          [4, 0],
          [5, 0],
        ]),
      ]),
    );
    const reactions = new Map<string, number>();
    for (const node of nodes)
      for (const dof of node.restraints)
        reactions.set(`${node.number}:${dof}`, 0);
    const result = parseSlabOutput(raw, input, dofs, reactions);
    for (const { number, x, y } of nodes) {
      expect(result.nodes[number - 1].mx).toBeCloseTo(mx(x, y), 11);
      expect(result.nodes[number - 1].my).toBeCloseTo(my(x, y), 11);
    }
  });
  it("gera triângulos numerados no sentido anti-horário, com bordas e GL coerentes", () => {
    const p = slabBenchmarkProject();
    const [slab] = p.slabs;
    slab.divisionsX = slab.divisionsY = 2;
    const mesh = meshSlab(slab, 3);
    expect(mesh).toEqual(meshSlab(slab, 3));
    expect(mesh.edges).toEqual({
      xMin: [1, 4, 7],
      xMax: [3, 6, 9],
      yMin: [1, 2, 3],
      yMax: [7, 8, 9],
    });
    expect(mesh.elements).toHaveLength(8);
    expect(mesh.elements.slice(0, 2)).toEqual([
      { number: 1, nodes: [1, 2, 5] },
      { number: 2, nodes: [1, 5, 4] },
    ]);
    expect(mesh.nodes[0].restraints).toEqual([3, 4, 5]);
    expect(mesh.nodes[1].restraints).toEqual([3, 5]);
    expect(mesh.nodes[3].restraints).toEqual([3, 4]);
    expect(mesh.nodes[4]).toMatchObject({ x: 2, y: 1.5, z: 3, restraints: [] });
  });

  it("rejeita entradas inválidas e análises sem a estabilidade e o isolamento exigidos", () => {
    const p = slabBenchmarkProject();
    const [slab] = p.slabs;
    const withChange = (change: Partial<typeof slab>) =>
      JSON.stringify({ ...p, slabs: [{ ...slab, ...change }] });
    expect(() => parseProject(withChange({ thickness: 0 }))).toThrow();
    expect(() => parseProject(withChange({ lengthX: -4 }))).toThrow();
    expect(() => parseProject(withChange({ divisionsX: 3.5 }))).toThrow();
    expect(() => parseProject(withChange({ divisionsY: 65 }))).toThrow();
    expect(() => parseProject(withChange({ levelId: "ausente" }))).toThrow(
      /pavimento inexistente/,
    );
    expect(() => parseProject(withChange({ materialId: "ausente" }))).toThrow(
      /material inexistente/,
    );
    expect(() => parseProject(withChange({ x: 1e20 }))).toThrow(
      /coordenadas da malha/,
    );
    slab.supports = { xMin: true, xMax: false, yMin: false, yMax: false };
    expect(() => exportOofem(p, "EL")).toThrow(/pelo menos duas bordas/);
    slab.supports.xMax = true;
    addPoint(p, { x: 1, y: 1, z: 3 });
    expect(() => exportOofem(p, "EL")).toThrow(/laje isolada/);
    p.loadPatterns[0].pressure[0].slabId = "ausente";
    expect(() => parseProject(serializeProject(p))).toThrow(
      /pressão em laje inexistente/,
    );
  });
});

describe("edição espacial", () => {
  const point = (x: number, y: number, z = 0) => ({ x, y, z });
  it("subdivide cruzamentos e encontros em T em 3D, preservando a carga por metro", () => {
    const p = createProject("spatial");
    const a = addMember(p, point(0, 1), point(4, 1));
    addMember(p, point(2, 0), point(2, 3));
    addMember(p, point(3, 1), point(3, 1, 2));
    addMember(p, point(1, 0, 2), point(1, 3, 2));
    p.loadPatterns[0].uniform = [{ ...uniformLoad(a.id), qy: -1234 }];
    const result = connectIntersections(p);
    expect(result).toEqual({ divided: 2, joints: 1 });
    expect(p.members).toHaveLength(7);
    expect(p.loadPatterns[0].uniform.map((l) => l.qy)).toEqual([
      -1234, -1234, -1234,
    ]);
    const linked = p.nodes.find((n) => n.x === 2 && n.y === 1 && n.z === 0)!;
    expect(
      p.members.filter((b) => b.start === linked.id || b.end === linked.id),
    ).toHaveLength(4);
    expect(connectIntersections(p)).toEqual({ divided: 0, joints: 0 });
  });
  it("identifica barras colineares sobrepostas e a falta de restrição à torção rígida", () => {
    const p = createProject("spatial");
    addMember(p, point(0, 0), point(3, 0));
    for (const n of p.nodes)
      Object.assign(n.restraints, { ux: true, uy: true, uz: true });
    expect(analysisErrors(p).join()).toMatch(/corpo rígido/);
    p.nodes[0].restraints.rx = true;
    expect(analysisErrors(p)).toEqual([]);
    addMember(p, point(1, 0), point(4, 0));
    expect(() => connectIntersections(p)).toThrow(/sobrepostas/);
  });
  it("replica uma seleção em pavimentos, com nós livres e sem duplicar as cargas", () => {
    const p = createProject("spatial");
    const a = addMember(p, point(0, 0), point(4, 0));
    a.roll = 45;
    p.nodes[0].restraints.ux = true;
    p.loadPatterns[0].nodal = [{ ...nodalLoad(p.nodes[0].id), my: 2000 }];
    p.loadPatterns[0].uniform = [{ ...uniformLoad(a.id), qz: -1000 }];
    const destination = addPoint(p, point(0, 0, 3));
    const selection = replicate(
      p,
      [{ kind: "member", id: a.id }],
      point(0, 0, 3),
      2,
    );
    expect(selection).toHaveLength(2);
    expect(p.nodes).toHaveLength(6);
    expect(p.members[1]).toMatchObject({
      start: destination.id,
      roll: 45,
      sectionId: a.sectionId,
    });
    expect(p.nodes.filter((n) => n.restraints.ux)).toHaveLength(1);
    expect(p.loadPatterns[0].nodal).toHaveLength(1);
    expect(p.loadPatterns[0].uniform).toHaveLength(1);
    expect(parseProject(serializeProject(p))).toEqual(p);
  });
});

describe("pré-validação e contrato do adaptador", () => {
  it("detecta apoios insuficientes em cada componente desconectado", () => {
    const p = beamExample();
    p.nodes[0].restraints.ux = false;
    expect(analysisErrors(p).join()).toMatch(/corpo rígido/);
  });
  it("recusa Y não nulo e nós no meio de barra sem subdivisão", () => {
    const p = beamExample();
    p.nodes[0].y = 1;
    expect(() => exportOofem(p, "EL")).toThrow(/XZ/);
    p.nodes[0].y = 0;
    addPoint(p, { x: 3, y: 0, z: 0 });
    expect(analysisErrors(p).join()).toMatch(/interior/);
  });
  it("gera IDs separados para a malha sem alterar o modelo e transforma as cargas globais para eixos locais", () => {
    const p = beamExample(),
      before = serializeProject(p);
    const input = exportOofem(p, "EL");
    expect(input.elements).toHaveLength(8);
    expect(input.nodes).toHaveLength(9);
    expect(input.deck).toContain("csType 1");
    expect(serializeProject(p)).toBe(before);
    expect(exportOofem(p, "EL").deck).toBe(input.deck);
  });
  it("rejeita saída truncada ou sem dados, mesmo com uma mensagem de término", () => {
    const input = exportOofem(beamExample(), "EL");
    expect(() => parseOofemOutput("incomplete", input)).toThrow(/incompleta/);
    expect(() =>
      parseOofemOutput(
        "Output for time 1\nFinishing analysis on: 2026-11-24",
        input,
      ),
    ).toThrow(/ausentes/);
  });
  it("impede cargas ponderadas não finitas apenas no caso que as aplica", () => {
    const p = beamExample();
    p.analysisCases.push({
      ...p.analysisCases[0],
      id: "Excesso",
      name: "Caso com fator excessivo",
      factors: [{ patternId: "G", factor: 1e308 }],
    });
    expect(exportOofem(p, "EL").deck).toContain("ConstantEdgeLoad");
    expect(() => exportOofem(p, "Excesso")).toThrow(
      /fora do intervalo numérico/,
    );
  });
});
