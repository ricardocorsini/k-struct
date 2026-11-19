import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Maximize } from "lucide-react";
import { interpolate, type Point3 } from "../domain/geometry";
import type { Project, SelectedObject, Selection } from "../domain/model";
import type { AnalysisResult } from "../solver/oofem";
import { additiveSelection } from "./WorkPlaneView";

interface SceneState {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  model: THREE.Group;
  render: () => void;
  fit: () => void;
}
function disposeModel(group: THREE.Group) {
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    mesh.geometry?.dispose();
    if (mesh.material)
      for (const m of Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material])
        m.dispose();
  });
  group.clear();
}
const scenePoint = (p: Point3) => new THREE.Vector3(p.x, p.z, -p.y);

export default function SpatialView({
  project,
  selection,
  result,
  onSelect,
}: {
  project: Project;
  selection: SelectedObject[];
  result: AnalysisResult | null;
  onSelect: (s: Selection, additive: boolean) => void;
}) {
  const container = useRef<HTMLDivElement>(null),
    state = useRef<SceneState | null>(null);
  const select = useRef(onSelect);
  select.current = onSelect;
  const [error, setError] = useState(false);
  const deformationScale = useMemo(() => {
    if (!result) return 0;
    const bounds = new THREE.Box3().setFromPoints(
      project.nodes.map(scenePoint),
    );
    const span = bounds.getSize(new THREE.Vector3()).length();
    let max = 0;
    for (const stations of Object.values(result.members))
      for (const s of stations)
        max = Math.max(max, Math.hypot(s.ux, s.uy, s.uz));
    return max > 1e-12 ? (Math.max(span, 1) * 0.14) / max : 1;
  }, [project.nodes, result]);
  useEffect(() => {
    const el = container.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      setError(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute(
      "aria-label",
      "Vista espacial da estrutura",
    );
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#101824");
    const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100000);
    camera.position.set(10, 7, 11);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.target.set(3, 0, 0);
    const model = new THREE.Group();
    scene.add(model);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x38404f, 3));
    const grid = new THREE.GridHelper(30, 30, 0x405269, 0x243043);
    grid.position.y = -0.025;
    scene.add(grid);
    const axes = new THREE.AxesHelper(1.5);
    axes.rotation.x = -Math.PI / 2;
    scene.add(axes);
    const render = () => renderer.render(scene, camera);
    const fit = () => {
      const box = new THREE.Box3().setFromObject(model),
        center = new THREE.Vector3(3, 1, 0),
        extent = new THREE.Vector3(6, 3, 3);
      if (!box.isEmpty()) {
        box.getCenter(center);
        box.getSize(extent);
      }
      const halfVerticalFov = THREE.MathUtils.degToRad(camera.fov / 2);
      const halfHorizontalFov = Math.atan(
        Math.tan(halfVerticalFov) * camera.aspect,
      );
      const distance =
        (Math.max(2, extent.length() / 2) /
          Math.sin(Math.min(halfVerticalFov, halfHorizontalFov))) *
        1.15;
      camera.position
        .copy(center)
        .add(
          new THREE.Vector3(0.8, 0.6, 1.2).normalize().multiplyScalar(distance),
        );
      controls.target.copy(center);
      controls.update();
      render();
    };
    controls.addEventListener("change", render);
    let measured = false;
    const resize = new ResizeObserver(() => {
      const { width, height } = el.getBoundingClientRect();
      renderer.setSize(width, height);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
      if (!measured) {
        measured = true;
        fit();
      } else render();
    });
    resize.observe(el);
    const ray = new THREE.Raycaster();
    ray.params.Line = { threshold: 0.12 };
    let down = { x: 0, y: 0 };
    const pointerDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY };
    };
    const pointerUp = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      const r = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - r.left) / r.width) * 2 - 1,
          (-(e.clientY - r.top) / r.height) * 2 + 1,
        ),
        camera,
      );
      const hit = ray
        .intersectObjects(model.children, true)
        .find((h) => h.object.userData.selection);
      select.current(
        hit?.object.userData.selection ?? null,
        additiveSelection(e),
      );
    };
    el.addEventListener("pointerdown", pointerDown);
    el.addEventListener("pointerup", pointerUp);
    controls.update();
    state.current = { renderer, scene, camera, controls, model, render, fit };
    return () => {
      state.current = null;
      resize.disconnect();
      controls.dispose();
      disposeModel(model);
      grid.geometry.dispose();
      (grid.material as THREE.Material).dispose();
      axes.geometry.dispose();
      (axes.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
      el.removeEventListener("pointerdown", pointerDown);
      el.removeEventListener("pointerup", pointerUp);
    };
  }, []);
  useEffect(() => {
    const s = state.current;
    if (!s) return;
    disposeModel(s.model);
    const nodes = new Map(project.nodes.map((n) => [n.id, n]));
    const selectedIds = new Set(
      selection.map((item) => `${item.kind}:${item.id}`),
    );
    for (const m of project.members) {
      const a = nodes.get(m.start)!,
        b = nodes.get(m.end)!;
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          scenePoint(a),
          scenePoint(b),
        ]),
        new THREE.LineBasicMaterial({
          color: selectedIds.has(`member:${m.id}`) ? "#d2b8ff" : "#91b2d5",
        }),
      );
      line.userData.selection = { kind: "member", id: m.id };
      s.model.add(line);
      const stations = result?.members[m.id];
      if (stations) {
        const positions = stations.map((v) => {
          const p = interpolate(a, b, v.t);
          return scenePoint({
            x: p.x + v.ux * deformationScale,
            y: p.y + v.uy * deformationScale,
            z: p.z + v.uz * deformationScale,
          });
        });
        s.model.add(
          new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(positions),
            new THREE.LineBasicMaterial({ color: "#67d6c0" }),
          ),
        );
      }
    }
    for (const n of project.nodes) {
      const selected = selectedIds.has(`node:${n.id}`);
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(selected ? 0.095 : 0.06, 12, 8),
        new THREE.MeshStandardMaterial({
          color: selected ? "#dab9ff" : "#cadbed",
        }),
      );
      sphere.position.set(n.x, n.z, -n.y);
      sphere.userData.selection = { kind: "node", id: n.id };
      s.model.add(sphere);
      if (Object.values(n.restraints).some(Boolean)) {
        const support = new THREE.Mesh(
          new THREE.ConeGeometry(0.16, 0.22, 4),
          new THREE.MeshStandardMaterial({ color: "#4b9b8e", wireframe: true }),
        );
        support.position.set(n.x, n.z - 0.13, -n.y);
        s.model.add(support);
      }
    }
    s.render();
  }, [project, selection, result, deformationScale]);
  useEffect(() => {
    state.current?.fit();
  }, [project.id]);
  return (
    <section className="viewport spatial">
      <div className="view-heading">
        <span>
          <i className="view-dot mint" />
          Perspectiva 3D <small>{result ? "DEFORMADA" : "MODELO"}</small>
        </span>
        <button
          title="Enquadrar vista 3D"
          aria-label="Enquadrar vista 3D"
          onClick={() => state.current?.fit()}
        >
          <Maximize size={14} />
        </button>
      </div>
      <div ref={container} className="three-container" />
      {error && (
        <div className="webgl-error">
          WebGL indisponível. Use o plano de trabalho para modelar.
        </div>
      )}
      <div className="spatial-compass">
        <span className="axis-z">Z</span>
        <span className="axis-x">X</span>
        <span className="axis-y">Y</span>
      </div>
      <div className="view-foot">
        <span>Arraste para orbitar · Scroll para zoom</span>
        <span>
          {result
            ? `×${deformationScale.toFixed(1)}`
            : project.mode === "planar"
              ? "Y = 0"
              : "XYZ · m"}
        </span>
      </div>
    </section>
  );
}
