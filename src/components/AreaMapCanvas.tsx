import { useEffect, useRef } from "react";
import type { XY } from "../domain/slabPolygon";
import {
  areaMapColor,
  interpolateArea,
  type AreaMap,
  type Limits,
} from "../solver/areaMaps";

export default function AreaMapCanvas({
  map,
  rings,
  limits,
  point,
  pick,
  label,
}: {
  map: AreaMap;
  rings: XY[][];
  limits: Limits | null;
  point: XY | null;
  pick: (point: XY) => void;
  label: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const bounds = rings.flat();
  const minX = Math.min(...bounds.map((p) => p.x)),
    minY = Math.min(...bounds.map((p) => p.y));
  const maxX = Math.max(...bounds.map((p) => p.x)),
    maxY = Math.max(...bounds.map((p) => p.y));
  const width = 520,
    height = 280;
  const zoom = Math.min(
    (width - 28) / (maxX - minX),
    (height - 28) / (maxY - minY),
  );
  const offsetX = (width - (maxX - minX) * zoom) / 2;
  const offsetY = (height - (maxY - minY) * zoom) / 2;
  useEffect(() => {
    const context = canvas.current!.getContext("2d");
    if (!context) return;
    const screen = (p: XY) => ({
      x: offsetX + (p.x - minX) * zoom,
      y: height - offsetY - (p.y - minY) * zoom,
    });
    context.clearRect(0, 0, width, height);
    function path(points: XY[]) {
      context!.beginPath();
      for (const [i, p] of points.entries()) {
        const s = screen(p);
        if (i === 0) context!.moveTo(s.x, s.y);
        else context!.lineTo(s.x, s.y);
      }
      context!.closePath();
    }

    for (const face of map.faces) {
      const fill = (coords: XY[], value: number | undefined) => {
        path(coords);
        context.fillStyle =
          value === undefined || !limits
            ? "#8995a0"
            : areaMapColor(value, limits);
        context.fill();
        // Close subpixel seams between tessellated patches.
        context.strokeStyle = context.fillStyle;
        context.lineWidth = 0.55;
        context.stroke();
      };
      if (!face.corners || !limits) {
        fill(face.points, face.value);
        continue;
      }
      const cuts =
        map.faces.length <= 1200 ? 6 : map.faces.length <= 6000 ? 3 : 2;
      const quad = face.points.length === 4;
      const weights = (u: number, v: number) =>
        quad
          ? [u * v, (1 - u) * v, (1 - u) * (1 - v), u * (1 - v)]
          : [1 - u - v, u, v];
      const xs = face.points.map((p) => p.x),
        ys = face.points.map((p) => p.y);
      function patch(vertices: [number, number][]) {
        const count = vertices.length;
        const center = weights(
          vertices.reduce((sum, v) => sum + v[0] / count, 0),
          vertices.reduce((sum, v) => sum + v[1] / count, 0),
        );
        const coords = vertices.map(([u, v]) => {
          const w = weights(u, v);
          return { x: interpolateArea(xs, w), y: interpolateArea(ys, w) };
        });
        fill(coords, interpolateArea(face.corners!, center));
      }
      for (let i = 0; i < cuts; i++)
        for (let j = 0; j < (quad ? cuts : cuts - i); j++) {
          const u = i / cuts,
            v = j / cuts,
            b = (i + 1) / cuts,
            t = (j + 1) / cuts;
          if (quad)
            patch([
              [u, v],
              [b, v],
              [b, t],
              [u, t],
            ]);
          else {
            patch([
              [u, v],
              [b, v],
              [u, t],
            ]);
            if (i + j + 1 < cuts)
              patch([
                [b, v],
                [b, t],
                [u, t],
              ]);
          }
        }
    }

    for (const ring of rings) {
      path(ring);
      context.strokeStyle = "#606d7a";
      context.lineWidth = 1;
      context.stroke();
    }
    if (
      point &&
      point.x >= minX &&
      point.x <= maxX &&
      point.y >= minY &&
      point.y <= maxY
    ) {
      const marker = screen(point);
      context.beginPath();
      context.arc(marker.x, marker.y, 5, 0, Math.PI * 2);
      context.strokeStyle = "white";
      context.lineWidth = 3;
      context.stroke();
      context.strokeStyle = "#111827";
      context.lineWidth = 1.5;
      context.stroke();
    }
  }, [
    map,
    rings,
    limits,
    point,
    zoom,
    offsetX,
    offsetY,
    minX,
    maxX,
    minY,
    maxY,
  ]);
  return (
    <canvas
      ref={canvas}
      width={width}
      height={height}
      role="img"
      aria-label={label}
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        pick({
          x:
            minX +
            (((event.clientX - rect.left) * width) / rect.width - offsetX) /
              zoom,
          y:
            minY +
            (height -
              ((event.clientY - rect.top) * height) / rect.height -
              offsetY) /
              zoom,
        });
      }}
    />
  );
}
