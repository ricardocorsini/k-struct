import { describe, expect, it } from "vitest";
import {
  addPoint,
  analysisErrors,
  beamExample,
  createProject,
  parseProject,
  removeSelection,
  serializeProject,
} from "../src/domain/model";
import { historyReducer } from "../src/domain/history";
import { exportOofem, parseOofemOutput } from "../src/solver/oofem";
import {
  addMember,
  connectIntersections,
  replicate,
} from "../src/domain/editing";
import { nodalLoad, uniformLoad } from "../src/domain/model";

describe("projeto versionado e edição", () => {
  it("salva e reabre sem alterar IDs, unidades ou cargas", () => {
    const p = beamExample();
    expect(parseProject(serializeProject(p))).toEqual(p);
  });
  it("migra o arquivo gerado pela versão 0.2 com o contrato plano original", () => {
    const { mode, guides, ...current } = beamExample();
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
    expect(p.schemaVersion).toBe(2);
    expect(p.nodes.map((n) => n.id)).toEqual(["A", "B"]);
    expect(p.members[0]).toMatchObject({ id: "V1", roll: 0 });
    expect(p.loadPatterns[0].nodal[0]).toEqual({
      ...nodalLoad("B"),
      fz: -700,
      my: 230,
    });
    expect(exportOofem(p, "EL").deck).toContain("domain 2dBeam");
  });
  it("recusa versões futuras, propriedades estranhas e referências quebradas", () => {
    const p = beamExample();
    expect(() =>
      parseProject(JSON.stringify({ ...p, schemaVersion: 3 })),
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
      parseOofemOutput("Output for time 1\nFinishing analysis", input),
    ).toThrow(/ausentes/);
  });
});
