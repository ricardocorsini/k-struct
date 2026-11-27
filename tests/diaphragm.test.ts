import { legacyPatterns } from "./fixtures/project-v8";
import { describe, expect, it } from "vitest";
import {
  parseProject,
  referenceErrors,
  removeSelection,
  serializeProject,
} from "../src/domain/model";
import { historyReducer } from "../src/domain/history";
import { diaphragmBenchmark } from "./fixtures/diaphragm";

describe("KS-27 · vínculos do pavimento", () => {
  it("migra v14, preserva IDs, molas, referência e grupos ao reabrir e desfazer", () => {
    const p = diaphragmBenchmark();
    p.selectionGroups = [
      { id: "g", name: "Piso", objects: [{ kind: "node", id: "C" }] },
    ];
    const old = { ...p, schemaVersion: 14, loadPatterns: legacyPatterns(p) };
    delete old.diaphragms;
    const migrated = parseProject(JSON.stringify(old));
    expect(migrated.schemaVersion).toBe(33);
    expect(migrated.nodes).toEqual(p.nodes);
    expect(migrated.selectionGroups).toEqual(p.selectionGroups);
    expect(migrated.diaphragms).toBeUndefined();
    expect(parseProject(serializeProject(p))).toEqual(p);
    const next = structuredClone(p);
    removeSelection(next, [{ kind: "node", id: "C" }]);
    expect(next.diaphragms![0].nodeIds).toEqual(["S", "E", "N"]);
    expect(next.diaphragms![0].reference).toEqual({ x: 0, y: 0 });
    removeSelection(next, [
      { kind: "node", id: "E" },
      { kind: "node", id: "N" },
    ]);
    expect(next.diaphragms).toBeUndefined();
    const h = historyReducer(
      { past: [], current: p, future: [] },
      { type: "change", project: next },
    );
    expect(historyReducer(h, { type: "undo" }).current).toEqual(p);
  });
  it("diagnostica IDs inexistentes, sobreposição, pavimento e vínculos redundantes", () => {
    const p = diaphragmBenchmark(),
      f = p.diaphragms![0];
    f.nodeIds.push("C", "ausente");
    p.nodes[2].z += 0.001;
    p.diaphragms!.push({ ...f, id: "D2", nodeIds: ["S", "C"] });
    const errors = referenceErrors(p).join(" ");
    expect(errors).toMatch(/repetida/);
    expect(errors).toMatch(/inexistente/);
    expect(errors).toMatch(/plano do pavimento/);
    const redundant = diaphragmBenchmark();
    redundant.nodes[2].restraints.uy = true;
    expect(() => parseProject(serializeProject(redundant))).toThrow(
      /apoio UY.*redundante/,
    );
    redundant.nodes[2].restraints.uy = false;
    redundant.nodes[2].springs = { uy: 9e6 };
    expect(referenceErrors(redundant)).toEqual([]);
  });
});
