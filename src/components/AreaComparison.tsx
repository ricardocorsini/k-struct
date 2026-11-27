import { useEffect, useMemo, useRef, useState } from "react";
import type { Project } from "../domain/model";
import { insideRing, type XY } from "../domain/slabPolygon";
import {
  areaFields,
  areaMapColor,
  buildAreaMap,
  comparisonAreas,
  otherAreaPoint,
  probeArea,
  sharedLimits,
  type AreaField,
  type ComparisonArea,
  type Limits,
  type Recovery,
} from "../solver/areaMaps";
import type { AnalysisResult } from "../solver/oofem";
import { formatUnitInput, parseUnitInput, unitLabel } from "../units";
import { formatResult, formatResultQuantity } from "./resultFormatting";
import AreaMapCanvas from "./AreaMapCanvas";
import { useUnits } from "./Units";

type Saved = {
  name: string;
  result: AnalysisResult;
  areaId: string;
  point: XY | null;
};
const savedId = ":saved";

type Props = {
  project: Project;
  cases: ReadonlyMap<string, AnalysisResult>;
  caseId: string;
  areaId?: string;
};
export default function AreaComparison(props: Props) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<Saved | null>(null);
  return (
    <>
      <button className="tool-button" onClick={() => setOpen(true)}>
        Comparar mapas de áreas
      </button>
      {open && (
        <ComparisonDialog
          {...props}
          saved={saved}
          save={setSaved}
          close={() => setOpen(false)}
        />
      )}
    </>
  );
}

function ComparisonDialog({
  project,
  cases,
  caseId,
  areaId,
  saved,
  save,
  close,
}: Props & {
  saved: Saved | null;
  save: (s: Saved) => void;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current!.showModal();
  }, []);
  const areas = useMemo(() => comparisonAreas(project), [project]);
  const [selected, setSelected] = useState(saved?.areaId ?? areaId ?? "");
  const area = areas.find((v) => v.id === selected) ?? areas[0];
  const [first, setFirst] = useState(saved ? savedId : caseId);
  const [second, setSecond] = useState(
    saved
      ? caseId
      : (project.analysisCases.find((c) => c.id !== caseId)?.id ?? caseId),
  );
  return (
    <dialog
      ref={dialog}
      className="slab-sizing-dialog area-comparison"
      aria-label="Comparação de mapas de áreas"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <h2>Comparação de mapas de áreas</h2>
      <label>
        Painel físico{" "}
        <select
          value={area.id}
          onChange={(event) => setSelected(event.target.value)}
        >
          {areas.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} [{v.id}]
            </option>
          ))}
        </select>
      </label>
      <ComparisonContent
        key={area.id}
        area={area}
        areas={areas}
        project={project}
        cases={cases}
        first={first}
        second={second}
        setFirst={setFirst}
        setSecond={setSecond}
        saved={saved}
        save={save}
      />
      <footer>
        <button onClick={close}>Fechar comparação de mapas</button>
      </footer>
    </dialog>
  );
}

function ComparisonContent({
  area,
  areas,
  project,
  cases,
  first,
  second,
  setFirst,
  setSecond,
  saved,
  save,
}: {
  area: ComparisonArea;
  areas: ComparisonArea[];
  project: Project;
  cases: Props["cases"];
  first: string;
  second: string;
  setFirst: (id: string) => void;
  setSecond: (id: string) => void;
  saved: Saved | null;
  save: (s: Saved) => void;
}) {
  const { units } = useUnits();
  const [field, setField] = useState<AreaField>(area.fields[0]);
  const [method, setMethod] = useState<Recovery>("smooth");
  const [fixed, setFixed] = useState<Limits | null>(null);
  const [error, setError] = useState("");
  const [coordinates, setCoordinates] = useState(() => {
    const point = saved?.areaId === area.id ? saved.point : null;
    return {
      x: point ? formatUnitInput(point.x, "length", units) : "",
      y: point ? formatUnitInput(point.y, "length", units) : "",
    };
  });
  const x = parseUnitInput(coordinates.x, "length", units);
  const y = parseUnitInput(coordinates.y, "length", units);
  const point = x === null || y === null ? null : { x, y };
  const pick = (point: XY) =>
    setCoordinates({
      x: formatUnitInput(point.x, "length", units),
      y: formatUnitInput(point.y, "length", units),
    });
  const resultFor = (id: string) =>
    id === savedId ? saved?.result : cases.get(id);
  const a = resultFor(first),
    b = resultFor(second);
  const mapA = useMemo(
    () => (a ? buildAreaMap(a, area, field, method) : null),
    [a, area, field, method],
  );
  const mapB = useMemo(
    () => (b ? buildAreaMap(b, area, field, method) : null),
    [b, area, field, method],
  );
  const auto = sharedLimits([mapA, mapB]);
  const limits = fixed ?? auto;
  const [label, quantity] = areaFields[field];
  const unit = unitLabel(quantity, units) + (quantity === "moment" ? "/m" : "");
  const format = (value: number) =>
    formatResultQuantity(value, quantity, units);
  const valueLabel = (value: number) => `${format(value)} ${unit}`;
  const options = project.analysisCases.map((c) => ({
    id: c.id,
    name: c.name,
  }));
  if (saved)
    options.push({ id: savedId, name: `Malha guardada · ${saved.name}` });
  const name = (id: string) => options.find((c) => c.id === id)?.name ?? id;
  const sides = [
    { side: "A", id: first, set: setFirst, result: a, map: mapA },
    { side: "B", id: second, set: setSecond, result: b, map: mapB },
  ];
  const ticks =
    limits &&
    (limits[0] === limits[1]
      ? [limits[0]]
      : [limits[0], limits[0] / 2 + limits[1] / 2, limits[1]]);
  const sign =
    field === "uz"
      ? "UZ positivo para cima."
      : area.kind === "slab"
        ? `${label} positivo traciona a face inferior no eixo ${field === "mx" ? "X" : "Y"}.`
        : field.startsWith("u")
          ? "Deslocamentos positivos no sentido do eixo resistente indicado."
          : field.startsWith("n")
            ? "N11 e N22 positivos em tração. N12 positivo no sentido +2 na face de normal +1."
            : "Momentos por metro no referencial resistente. M11 e M22 positivos tracionam a face +3 nas respectivas direções. M12 é a componente de torção do tensor de momentos.";
  const formatAxis = (v: { x: number; y: number; z: number }) =>
    [v.x, v.y, v.z].map((n) => formatResult(n)).join(" / ");
  const adjacent =
    point &&
    areas
      .filter((other) => other.id !== area.id && other.kind === area.kind)
      .flatMap((other) => {
        const local = otherAreaPoint(area, point, other);
        return local ? [{ other, local }] : [];
      });
  return (
    <>
      <div className="area-comparison-controls">
        <label>
          Componente{" "}
          <select
            value={field}
            onChange={(e) => {
              setField(e.target.value as AreaField);
              setFixed(null);
              setError("");
            }}
          >
            {area.fields.map((key) => (
              <option key={key} value={key}>
                {areaFields[key][0]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Recuperação{" "}
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as Recovery)}
          >
            <option value="smooth">Suavizada</option>
            <option value="element">Elementar</option>
          </select>
        </label>
        {(["x", "y"] as const).map((axis) => (
          <label key={axis}>
            {axis.toUpperCase()} local ({units.length})
            <input
              inputMode="decimal"
              aria-label={`${axis.toUpperCase()} local da comparação`}
              value={coordinates[axis]}
              onChange={(e) =>
                setCoordinates({ ...coordinates, [axis]: e.target.value })
              }
            />
          </label>
        ))}
      </div>
      <p>
        Clique em um mapa ou informe X e Y para consultar a mesma posição nos
        dois mapas.
      </p>
      <p>
        {sign}{" "}
        {area.kind === "slab"
          ? "Coordenadas paralelas a X e Y globais."
          : `Coordenadas no plano geométrico a partir de A, com X ao longo de AB. Componentes nos eixos resistentes (giro ${area.angle}°).`}
      </p>
      <p>
        {method === "element"
          ? "Valores médios por elemento, com leituras separadas em bordas comuns."
          : quantity === "displacement"
            ? "Deslocamentos nodais interpolados por elemento."
            : area.kind === "slab"
              ? "Momentos extrapolados dos pontos de integração, suavizados nos nós da laje e interpolados no elemento."
              : "Médias elementares ponderadas pela área em cada nó e interpoladas no triângulo. Cada painel tem recuperação própria."}
      </p>
      <details>
        <summary>Origem e eixos da consulta</summary>
        <p>
          Origem XYZ ({units.length}) ·{" "}
          {[area.origin.x, area.origin.y, area.origin.z]
            .map((n) => formatResultQuantity(n, "length", units))
            .join(" / ")}
        </p>
        {area.axes.map((v, i) => (
          <p key={i}>
            Eixo {i + 1} em XYZ · {formatAxis(v)}
          </p>
        ))}
        {area.kind === "panel" &&
          area.resultAxes.map((v, i) => (
            <p key={i}>
              Eixo resistente {i + 1} em XYZ · {formatAxis(v)}
            </p>
          ))}
        <p>
          Compare a mesma componente, o mesmo painel físico e o mesmo
          referencial. A cor indica o valor da legenda, e valores além dos
          limites fixados usam as cores das extremidades.
        </p>
      </details>
      <form
        className="area-comparison-controls"
        key={`${field}:${unit}:${Boolean(fixed)}:${limits?.join(",")}`}
        onSubmit={(event) => {
          event.preventDefault();
          const fields = new FormData(event.currentTarget);
          const min = parseUnitInput(
              String(fields.get("lower")),
              quantity,
              units,
            ),
            max = parseUnitInput(String(fields.get("upper")), quantity, units);
          if (min === null || max === null || min >= max)
            setError("Informe limites finitos com mínimo menor que o máximo.");
          else {
            setFixed([min, max]);
            setError("");
          }
        }}
      >
        <label>
          Mínimo ({unit}){" "}
          <input
            name="lower"
            inputMode="decimal"
            defaultValue={
              limits ? formatUnitInput(limits[0], quantity, units) : ""
            }
          />
        </label>
        <label>
          Máximo ({unit}){" "}
          <input
            name="upper"
            inputMode="decimal"
            defaultValue={
              limits ? formatUnitInput(limits[1], quantity, units) : ""
            }
          />
        </label>
        <button type="submit">Fixar limites</button>
        <button
          type="button"
          disabled={!fixed}
          onClick={() => {
            setFixed(null);
            setError("");
          }}
        >
          Usar escala automática
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      <div className="area-map-legend" aria-label="Legenda comum">
        <b>
          {label} ({unit}) · {fixed ? "Escala fixada" : "Escala automática"}
        </b>
        {ticks && limits ? (
          ticks.map((value) => (
            <span key={value}>
              <i style={{ background: areaMapColor(value, limits) }} />
              {valueLabel(value)}
            </span>
          ))
        ) : (
          <span>Sem valores para definir a escala.</span>
        )}
      </div>
      <div className="area-map-grid">
        {sides.map(({ side, id, set, result, map }) => {
          const hits = point && probeArea(map, point);
          const neighborReadings =
            result && hits?.length && adjacent
              ? adjacent.flatMap(({ other, local }) => {
                  if (!other.fields.includes(field)) return [];
                  return probeArea(
                    buildAreaMap(result, other, field, method),
                    local,
                  ).map((hit) => ({ ...hit, area: other }));
                })
              : [];
          return (
            <section key={side} aria-label={`Mapa ${side}`}>
              <label>
                Resultado {side}{" "}
                <select value={id} onChange={(e) => set(e.target.value)}>
                  {options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </label>
              {!map ? (
                <p>
                  {name(id)} · Resultado indisponível nesta revisão. Analise o
                  caso para preencher este mapa.
                </p>
              ) : (
                <>
                  <p>
                    {map.faces.length} elementos
                    {!map.range && " · Componente indisponível"}
                  </p>
                  <AreaMapCanvas
                    map={map}
                    rings={area.rings}
                    limits={limits}
                    point={point}
                    pick={pick}
                    label={`Mapa ${side} de ${label}`}
                  />
                  {point &&
                    (hits?.length ? (
                      <table aria-label={`Leitura no mapa ${side}`}>
                        <thead>
                          <tr>
                            <th>Painel</th>
                            <th>Elemento</th>
                            <th>Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            ...hits.map((hit) => ({ ...hit, area })),
                            ...neighborReadings,
                          ].map((hit) => (
                            <tr key={`${hit.area.id}:${hit.element}`}>
                              <td>
                                {hit.area.name}
                                {hit.area.id !== area.id &&
                                  " · referencial próprio"}
                              </td>
                              <td>{hit.element}</td>
                              <td>
                                {hit.value === undefined ? (
                                  "Sem valor"
                                ) : (
                                  <>
                                    {hit.area.id === area.id && limits && (
                                      <i
                                        className="area-swatch"
                                        style={{
                                          background: areaMapColor(
                                            hit.value,
                                            limits,
                                          ),
                                        }}
                                      />
                                    )}
                                    {valueLabel(hit.value)}
                                  </>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p>
                        {area.rings
                          .slice(1)
                          .some((ring) => insideRing(point, ring))
                          ? "Ponto em uma abertura."
                          : "Ponto fora do domínio do painel."}
                      </p>
                    ))}
                </>
              )}
              {side === "A" && (
                <button
                  disabled={!result || !map || id === savedId}
                  onClick={() => {
                    if (!result) return;
                    save({ name: name(id), result, areaId: area.id, point });
                    setFirst(savedId);
                  }}
                >
                  Guardar malha do mapa A
                </button>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
