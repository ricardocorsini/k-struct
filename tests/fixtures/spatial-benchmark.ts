import {
  createProject,
  free,
  nodalLoad,
  uniformLoad,
  type Project,
} from "../../src/domain/model";
import type { AnalysisResult } from "../../src/solver/oofem";
import model from "./portal-spatial.json" with { type: "json" };
import expected from "./portal-spatial-expected.json" with { type: "json" };

export function spatialBenchmark(): Project {
  const p = createProject("spatial");
  p.materials[0].E = model.e;
  p.materials[0].nu = model.nu;
  [p.sections[0].width, p.sections[0].height] = model.section;
  p.nodes = model.nodes.map(([x, y, z], i) => {
    const id = `N${i + 1}`,
      fixed = model.fixed.includes(i);
    return {
      id,
      name: id,
      x,
      y,
      z,
      restraints: fixed
        ? { ux: true, uy: true, uz: true, rx: true, ry: true, rz: true }
        : free(),
    };
  });
  p.members = model.members.map(([start, end, roll], i) => {
    const id = `B${i + 1}`;
    return {
      id,
      name: id,
      start: p.nodes[start].id,
      end: p.nodes[end].id,
      sectionId: p.sections[0].id,
      roll,
    };
  });
  p.loadPatterns[0].nodal = model.nodal.map(
    ([node, fx, fy, fz, mx, my, mz]) => ({
      ...nodalLoad(p.nodes[node].id),
      fx,
      fy,
      fz,
      mx,
      my,
      mz,
    }),
  );
  p.loadPatterns[0].uniform = model.uniform.map(([bar, qx, qy, qz]) => ({
    ...uniformLoad(p.members[bar].id),
    qx,
    qy,
    qz,
  }));
  return p;
}

export function spatialBenchmarkDifferences(p: Project, r: AnalysisResult) {
  const differences: string[] = [];
  const compare = (
    label: string,
    actual: number[],
    reference: number[],
    absolute: number,
    relative: number,
  ) => {
    for (const [i, value] of reference.entries())
      if (
        !Number.isFinite(actual[i]) ||
        Math.abs(actual[i] - value) > absolute + relative * Math.abs(value)
      )
        differences.push(`${label}[${i}]: ${actual[i]} (esperado ${value})`);
  };
  for (const [i, n] of p.nodes.entries()) {
    const d = r.displacements[n.id];
    compare(
      n.name,
      [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz],
      expected.displacements[i],
      1e-10,
      1e-7,
    );
  }
  for (const [i, index] of model.fixed.entries()) {
    const n = p.nodes[index];
    const reaction = r.reactions.find((item) => item.nodeId === n.id)!;
    compare(
      `Reação ${n.name}`,
      [
        reaction.fx,
        reaction.fy,
        reaction.fz,
        reaction.mx,
        reaction.my,
        reaction.mz,
      ],
      expected.reactions[i],
      0.01,
      6e-5,
    );
  }
  for (const [i, m] of p.members.entries()) {
    const stations = r.members[m.id];
    for (const [end, { n, vy, vz, mx, my, mz }] of [
      stations[0],
      stations.at(-1)!,
    ].entries())
      compare(
        `${m.name} extremidade ${end + 1}`,
        [n, vy, vz, mx, my, mz],
        expected.endForces[i][end],
        0.01,
        6e-5,
      );
  }
  return differences;
}
