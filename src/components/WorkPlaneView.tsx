import { useEffect, useRef, useState } from "react";
import { Maximize, Minus, Plus } from "lucide-react";
import {
  coordinates,
  onPlane,
  planeCoordinates,
  planePoint,
  tolerance,
  type Coordinate,
  type Point3,
  type WorkPlane,
} from "../domain/geometry";
import type { Project, SelectedObject, Selection } from "../domain/model";
import type { AnalysisResult } from "../solver/oofem";

export type Tool = "select" | "node" | "member";
export type Display =
  | "model"
  | "deformed"
  | "m"
  | "v"
  | "n"
  | "vy"
  | "vz"
  | "mx"
  | "my"
  | "mz";
type UV = { u: number; v: number };
interface Props {
  project: Project;
  plane: WorkPlane;
  orthogonal: boolean;
  selection: SelectedObject[];
  tool: Tool;
  result: AnalysisResult | null;
  display: Display;
  patternId: string;
  pending: Point3 | null;
  onPoint: (p: Point3) => void;
  onSelect: (s: Selection, additive: boolean) => void;
}

export const additiveSelection = (e: {
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}) => e.ctrlKey || e.metaKey || e.shiftKey;

export default function WorkPlaneView({
  project,
  plane,
  orthogonal,
  selection,
  tool,
  result,
  display,
  patternId,
  pending,
  onPoint,
  onSelect,
}: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 700, height: 460 });
  const [camera, setCamera] = useState({ u: 3, v: 1.5, scale: 65 });
  const [cursor, setCursor] = useState<UV | null>(null);
  const pan = useRef<{ x: number; y: number; u: number; v: number } | null>(
    null,
  );
  const [labels, setLabels] = useState(true);
  const spatial = project.mode === "spatial";
  const [axisU, axisV, normal] = planeCoordinates[plane.kind];
  const uGuides = spatial ? project.guides[axisU] : [];
  const vGuides = spatial ? project.guides[axisV] : [];
  const nodes = project.nodes.filter((n) => onPlane(n, plane));
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const bars = project.members.filter(
    (m) => nodeMap.has(m.start) && nodeMap.has(m.end),
  );
  const selected = new Set(selection.map((s) => `${s.kind}:${s.id}`));
  const patterns = project.loadPatterns.find((p) => p.id === patternId)!;

  useEffect(() => {
    const resize = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSize({ width, height });
    });
    if (ref.current) resize.observe(ref.current);
    return () => resize.disconnect();
  }, []);

  const fit = () => {
    const us = [
      ...project.nodes.map((n) => n[axisU]),
      ...uGuides.map((g) => g.position),
    ];
    const vs = [
      ...project.nodes.map((n) => n[axisV]),
      ...vGuides.map((g) => g.position),
    ];
    const minU = Math.min(0, ...us),
      maxU = Math.max(6, ...us);
    const minV = Math.min(0, ...vs),
      maxV = Math.max(0, ...vs);
    setCamera({
      u: (minU + maxU) / 2,
      v: (minV + maxV) / 2,
      scale: Math.max(
        10,
        Math.min(
          (size.width - 105) / Math.max(6, maxU - minU),
          (size.height - 120) / Math.max(3, maxV - minV),
          100,
        ),
      ),
    });
  };
  useEffect(() => {
    fit();
    setCursor(null);
  }, [project.id, plane.kind]);
  useEffect(() => setCursor(null), [plane.offset]);

  const sx = (u: number) => size.width / 2 + (u - camera.u) * camera.scale;
  const sy = (v: number) => size.height / 2 - (v - camera.v) * camera.scale;
  const point = (event: {
    clientX: number;
    clientY: number;
    shiftKey: boolean;
  }) => {
    const rect = ref.current!.getBoundingClientRect();
    const u =
      (event.clientX - rect.left - size.width / 2) / camera.scale + camera.u;
    const v =
      -(event.clientY - rect.top - size.height / 2) / camera.scale + camera.v;
    const aligned =
      pending &&
      spatial &&
      orthogonal !== event.shiftKey &&
      onPlane(pending, plane);
    const horizontal =
      aligned && Math.abs(u - pending[axisU]) >= Math.abs(v - pending[axisV]);
    const lockU = aligned && !horizontal ? pending[axisU] : null;
    const lockV = horizontal ? pending[axisV] : null;
    const nearest = nodes.reduce<{
      node: (typeof nodes)[number];
      error: number;
    } | null>((best, n) => {
      if (lockU !== null && Math.abs(n[axisU] - lockU) >= tolerance)
        return best;
      if (lockV !== null && Math.abs(n[axisV] - lockV) >= tolerance)
        return best;
      const error = Math.hypot(n[axisU] - u, n[axisV] - v) * camera.scale;
      return error < (best?.error ?? 12) ? { node: n, error } : best;
    }, null);
    if (nearest) return { u: nearest.node[axisU], v: nearest.node[axisV] };
    const snap = (value: number, guides: typeof uGuides) => {
      const closest = guides.reduce(
        (best, g) =>
          Math.abs(g.position - value) < Math.abs(best - value)
            ? g.position
            : best,
        Infinity,
      );
      return Math.abs(closest - value) * camera.scale < 10
        ? closest
        : Math.round(value * 2) / 2;
    };
    return { u: lockU ?? snap(u, uGuides), v: lockV ?? snap(v, vGuides) };
  };

  const allStations = result ? Object.values(result.members).flat() : [];
  const dofU = `u${axisU}` as const,
    dofV = `u${axisV}` as const;
  const maxU = Math.max(
    1e-12,
    ...allStations.map((s) => Math.hypot(s[dofU], s[dofV])),
  );
  const deformationScale = 60 / (maxU * camera.scale);
  const maxForce =
    display === "model" || display === "deformed"
      ? 1
      : Math.max(1, ...allStations.map((s) => Math.abs(s[display])));
  const gridStep = camera.scale < 25 ? 2 : camera.scale > 120 ? 0.5 : 1;
  const grid = (center: number, pixels: number) => {
    const start =
      Math.floor((center - pixels / 2 / camera.scale) / gridStep) * gridStep;
    return Array.from(
      { length: Math.ceil(pixels / camera.scale / gridStep) + 2 },
      (_, i) => start + i * gridStep,
    );
  };
  const arrow = (x: number, y: number, dx: number, dy: number, key: string) => (
    <line
      key={key}
      x1={x - dx}
      y1={y - dy}
      x2={x}
      y2={y}
      stroke="#e7b45c"
      strokeWidth="1.4"
      markerEnd="url(#load-arrow)"
    />
  );
  const heading = plane.kind === "XY" ? "Planta XY" : `Elevação ${plane.kind}`;

  return (
    <section className="viewport elevation">
      <div className="view-heading">
        <span>
          <i className="view-dot" />
          {heading}
        </span>
        <div className="view-actions">
          <button
            title="Diminuir zoom"
            aria-label="Diminuir zoom"
            onClick={() =>
              setCamera((c) => ({ ...c, scale: Math.max(10, c.scale / 1.2) }))
            }
          >
            <Minus size={14} />
          </button>
          <button
            title="Aumentar zoom"
            aria-label="Aumentar zoom"
            onClick={() =>
              setCamera((c) => ({ ...c, scale: Math.min(300, c.scale * 1.2) }))
            }
          >
            <Plus size={14} />
          </button>
          <button
            title="Enquadrar modelo"
            aria-label="Enquadrar modelo"
            onClick={fit}
          >
            <Maximize size={14} />
          </button>
          <button
            className={labels ? "selected" : ""}
            title="Nomes dos objetos"
            onClick={() => setLabels((v) => !v)}
          >
            ID
          </button>
        </div>
      </div>
      <svg
        ref={ref}
        className={`drawing drawing-${tool}`}
        aria-label={`Área de lançamento ${plane.kind}`}
        role="application"
        tabIndex={0}
        onWheel={(e) => {
          e.preventDefault();
          setCamera((c) => ({
            ...c,
            scale: Math.max(
              10,
              Math.min(300, c.scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1)),
            ),
          }));
        }}
        onPointerDown={(e) => {
          if (e.button !== 1) return;
          e.preventDefault();
          pan.current = {
            x: e.clientX,
            y: e.clientY,
            u: camera.u,
            v: camera.v,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerUp={(e) => {
          if (!pan.current) return;
          pan.current = null;
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => {
          pan.current = null;
        }}
        onPointerMove={(e) => {
          const p = pan.current;
          if (p) {
            setCamera((c) => ({
              ...c,
              u: p.u - (e.clientX - p.x) / c.scale,
              v: p.v + (e.clientY - p.y) / c.scale,
            }));
          } else setCursor(point(e));
        }}
        onPointerLeave={() => setCursor(null)}
        onClick={(e) => {
          if (tool === "select") onSelect(null, additiveSelection(e));
          else {
            const { u, v } = point(e);
            onPoint(planePoint(u, v, plane));
          }
        }}
      >
        <defs>
          <marker
            id="load-arrow"
            markerWidth="7"
            markerHeight="7"
            refX="6"
            refY="3.5"
            orient="auto"
          >
            <path d="M0 0 L7 3.5 L0 7" fill="#e7b45c" />
          </marker>
        </defs>
        <g className="grid">
          {grid(camera.u, size.width).map((u) => (
            <g key={u}>
              <line
                x1={sx(u)}
                x2={sx(u)}
                y1="0"
                y2={size.height}
                className={u === 0 ? "axis" : ""}
              />
              <text x={sx(u) + 4} y={size.height - 10}>
                {Number(u.toFixed(2))}
              </text>
            </g>
          ))}
          {grid(camera.v, size.height).map((v) => (
            <g key={v}>
              <line
                x1="0"
                x2={size.width}
                y1={sy(v)}
                y2={sy(v)}
                className={v === 0 ? "axis" : ""}
              />
              <text x="8" y={sy(v) - 5}>
                {Number(v.toFixed(2))}
              </text>
            </g>
          ))}
        </g>
        <g className="work-guides" aria-hidden="true">
          {uGuides.map((g) => (
            <g key={g.id}>
              <line
                x1={sx(g.position)}
                x2={sx(g.position)}
                y1="0"
                y2={size.height}
                data-axis={axisU}
                data-position={g.position}
              />
              <text x={sx(g.position) + 5} y="17">
                {g.name}
              </text>
            </g>
          ))}
          {vGuides.map((g) => (
            <g key={g.id}>
              <line
                x1="0"
                x2={size.width}
                y1={sy(g.position)}
                y2={sy(g.position)}
                data-axis={axisV}
                data-position={g.position}
              />
              <text x={size.width - 8} y={sy(g.position) - 5} textAnchor="end">
                {g.name}
              </text>
            </g>
          ))}
        </g>
        {bars.map((m) => {
          const a = nodeMap.get(m.start)!,
            b = nodeMap.get(m.end)!;
          const u = a[axisU],
            v = a[axisV],
            du = b[axisU] - u,
            dv = b[axisV] - v;
          const active = selected.has(`member:${m.id}`);
          const loads = patterns.uniform.filter((l) => l.memberId === m.id);
          const components = coordinates.map((k) =>
            loads.reduce((sum, l) => sum + l[`q${k}`], 0),
          );
          const qu = components[coordinates.indexOf(axisU)],
            qv = components[coordinates.indexOf(axisV)];
          const norm = Math.hypot(qu, qv);
          const length = Math.hypot(du, dv);
          const stations = result?.members[m.id];
          let diagram: string | undefined;
          if (stations && display !== "model" && length >= tolerance) {
            diagram = stations
              .map((s) => {
                let pu = u + du * s.t,
                  pv = v + dv * s.t;
                if (display === "deformed") {
                  pu += s[dofU] * deformationScale;
                  pv += s[dofV] * deformationScale;
                } else {
                  const offset = ((s[display] / maxForce) * 70) / camera.scale;
                  pu += (dv / length) * offset;
                  pv -= (du / length) * offset;
                }
                return `${sx(pu)},${sy(pv)}`;
              })
              .join(" ");
          }
          return (
            <g key={m.id}>
              <line
                x1={sx(u)}
                y1={sy(v)}
                x2={sx(u + du)}
                y2={sy(v + dv)}
                stroke={active ? "#d2b8ff" : "#8ca8cb"}
                strokeWidth={active ? 4 : 2.5}
              />
              <line
                x1={sx(u)}
                y1={sy(v)}
                x2={sx(u + du)}
                y2={sy(v + dv)}
                stroke="transparent"
                strokeWidth="16"
                onClick={(e) => {
                  if (tool !== "select") return;
                  e.stopPropagation();
                  onSelect({ kind: "member", id: m.id }, additiveSelection(e));
                }}
              />
              {labels && (
                <text
                  className="member-label"
                  x={sx(u + du / 2) + 8}
                  y={sy(v + dv / 2) + 19}
                >
                  {m.name}
                </text>
              )}
              {display === "model" && components.some(Boolean) && (
                <g className="load-shape">
                  {norm > 0 &&
                    Array.from({ length: 9 }, (_, i) =>
                      arrow(
                        sx(u + (du * i) / 8),
                        sy(v + (dv * i) / 8),
                        (qu / norm) * 34,
                        (-qv / norm) * 34,
                        String(i),
                      ),
                    )}
                  <text
                    x={sx(u + du / 2)}
                    y={sy(v + dv / 2) - (qv <= 0 ? 45 : -55)}
                    textAnchor="middle"
                  >
                    {components
                      .flatMap((q, i) =>
                        q
                          ? [`q${coordinates[i].toUpperCase()} ${q / 1000}`]
                          : [],
                      )
                      .join(" · ")}{" "}
                    kN/m
                  </text>
                </g>
              )}
              {diagram &&
                (display === "deformed" ? (
                  <polyline
                    points={diagram}
                    fill="none"
                    stroke="#67d6c0"
                    strokeWidth="2"
                    pointerEvents="none"
                  />
                ) : (
                  <polygon
                    points={`${sx(u)},${sy(v)} ${diagram} ${sx(u + du)},${sy(v + dv)}`}
                    fill="#a98ae92b"
                    stroke="#bd9af9"
                    strokeWidth="1.6"
                    pointerEvents="none"
                  />
                ))}
            </g>
          );
        })}
        {nodes.map((n) => {
          const active = selected.has(`node:${n.id}`);
          const x = sx(n[axisU]),
            y = sy(n[axisV]);
          const r = n.restraints;
          const hasSupport = Object.values(r).some(Boolean);
          const fixed = spatial ? Object.values(r).every(Boolean) : r.ry;
          const loads = patterns.nodal.filter((l) => l.nodeId === n.id);
          const force = (k: Coordinate) =>
            loads.reduce((sum, l) => sum + l[`f${k}`], 0);
          const fu = force(axisU),
            fv = force(axisV),
            fn = force(normal);
          const norm = Math.hypot(fu, fv);
          const moments = coordinates.flatMap((k) => {
            const m = loads.reduce((sum, l) => sum + l[`m${k}`], 0);
            return m ? [`M${k.toUpperCase()} ${m / 1000}`] : [];
          });
          return (
            <g
              key={n.id}
              className="node"
              onClick={(e) => {
                if (tool !== "select") return;
                e.stopPropagation();
                onSelect({ kind: "node", id: n.id }, additiveSelection(e));
              }}
            >
              {fixed && (
                <path
                  d={`M${x - 11} ${y + 7}h22m-20 0l-4 6m12-6l-4 6m12-6l-4 6`}
                  stroke="#67c7b1"
                  fill="none"
                />
              )}
              {!fixed && hasSupport && (
                <g stroke="#67c7b1" fill="#111b27">
                  <path d={`M${x} ${y + 4}l-9 14h18z`} />
                  {!r[dofU] && <path d={`M${x - 11} ${y + 22}h22`} />}
                </g>
              )}
              <circle cx={x} cy={y} r="12" fill="transparent" />
              <circle
                cx={x}
                cy={y}
                r={active ? 5.5 : 3.5}
                fill={active ? "#dbc4ff" : "#101a29"}
                stroke={active ? "#dbc4ff" : "#a9c0dd"}
                strokeWidth="1.8"
              />
              {labels && (
                <text x={x + 10} y={y - 12} className="node-label">
                  {n.name}
                </text>
              )}
              {display === "model" && (norm > 0 || fn !== 0) && (
                <g className="load-shape">
                  {norm > 0 &&
                    arrow(x, y, (fu / norm) * 50, (-fv / norm) * 50, "nodal")}
                  <text x={x + 12} y={y - (norm > 0 ? 52 : 28)}>
                    {coordinates
                      .flatMap((k) =>
                        force(k)
                          ? [`F${k.toUpperCase()} ${force(k) / 1000}`]
                          : [],
                      )
                      .join(" · ")}{" "}
                    kN
                  </text>
                </g>
              )}
              {display === "model" && moments.length > 0 && (
                <text x={x + 16} y={y + 35} className="moment-label">
                  {moments.join(" · ")} kN·m
                </text>
              )}
            </g>
          );
        })}
        {cursor && tool !== "select" && (
          <g pointerEvents="none">
            <path
              d={`M${sx(cursor.u) - 8} ${sy(cursor.v)}h16m-8-8v16`}
              stroke="#e3c7ff"
            />
            <rect
              x={sx(cursor.u) - 4}
              y={sy(cursor.v) - 4}
              width="8"
              height="8"
              stroke="#e3c7ff"
              fill="none"
            />
          </g>
        )}
        {pending && cursor && (
          <line
            x1={sx(pending[axisU])}
            y1={sy(pending[axisV])}
            x2={sx(cursor.u)}
            y2={sy(cursor.v)}
            stroke="#cfb5f8"
            strokeDasharray="6 4"
            pointerEvents="none"
          />
        )}
      </svg>
      {!project.nodes.length && (
        <div className="empty-canvas">
          <h2>Lance a primeira barra</h2>
          <p>
            Ative <b>Barra</b> e marque duas extremidades na malha.
          </p>
          <div>
            <kbd>B</kbd> desenhar barra <kbd>Esc</kbd> selecionar
          </div>
        </div>
      )}
      <div className="view-foot">
        <span>
          {normal.toUpperCase()} = {plane.offset} m <b>·</b> Snap 0,50 m
        </span>
        <span>
          {cursor
            ? `${axisU.toUpperCase()} ${cursor.u.toFixed(2)} · ${axisV.toUpperCase()} ${cursor.v.toFixed(2)} m`
            : display === "deformed"
              ? `Deformada ×${deformationScale.toFixed(1)}`
              : `${axisV.toUpperCase()} ↑  ${axisU.toUpperCase()} →`}
        </span>
      </div>
    </section>
  );
}
