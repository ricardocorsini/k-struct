import {
  beamExample,
  free,
  nodalLoad,
  type Project,
} from "../../src/domain/model";
import { sectionProperties } from "../../src/domain/sections";

export function planarTruss() {
  const project = beamExample();
  project.nodes.push({
    id: "C",
    name: "N3",
    x: 3,
    y: 0,
    z: 4,
    restraints: free(),
  });
  const bottom = project.members[0];
  project.members.push(
    { ...bottom, id: "AC", name: "AC", start: "A", end: "C" },
    { ...bottom, id: "BC", name: "BC", start: "B", end: "C" },
  );
  const section = {
    ...project.sections[0],
    shape: "rectangle",
    width: 0.025,
    height: 0.04,
  } as const;
  project.sections = [section];
  bottom.stiffness = { eiy: 0.000025 / sectionProperties(section).Iy };
  project.loadPatterns[0].uniform = [];
  project.loadPatterns[0].nodal = [{ ...nodalLoad("C"), fz: -10000 }];
  return project;
}

export function spatialBrace(): Project {
  const project = beamExample();
  project.mode = "spatial";
  const [a, b] = project.nodes;
  a.restraints = { ux: true, uy: true, uz: true, rx: true, ry: true, rz: true };
  b.x = 3;
  b.restraints = free();
  project.nodes.push({
    ...b,
    id: "C",
    name: "N3",
    y: 2,
    restraints: { ...free(), ux: true, uy: true, uz: true, ry: true },
  });

  const section = {
    ...project.sections[0],
    shape: "rectangle",
    width: 0.15,
    height: 0.2,
  } as const;
  const { Iz, J } = sectionProperties(section);
  const main = project.members[0];
  main.stiffness = { eiz: 0.00008 / Iz, gj: 0.0001 / J };
  project.sections = [
    section,
    { ...section, id: "brace", width: 0.025, height: 0.04 },
  ];
  project.members.push({
    roll: 0,
    id: "BC",
    name: "BC",
    start: "B",
    end: "C",
    sectionId: "brace",
  });
  project.loadPatterns[0].uniform = [];
  project.loadPatterns[0].nodal = [
    { ...nodalLoad("B"), fy: 10000, fz: -6000, mx: 900, mz: 6000 },
  ];
  return project;
}
