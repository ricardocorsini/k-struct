import { useEffect, useMemo, useRef, useState } from "react";
import {
  nextName,
  uid,
  type Project,
  type ServiceMeasure,
  type ServiceSource,
  type StructuralNode,
} from "../domain/model";
import { coordinates, type Point3 } from "../domain/geometry";
import {
  evaluateServiceMeasure,
  serviceGeometry,
} from "../solver/serviceMeasures";
import type { AnalysisResult } from "../solver/oofem";
import {
  formatQuantity,
  parseUnitNumber,
  type UnitPreferences,
} from "../units";
import { formatResult, formatResultQuantity } from "./resultFormatting";
import { useUnits } from "./Units";

const measureLabels = {
  difference: "Diferença entre nós",
  chord: "Flecha relativa à corda",
  drift: "Deriva entre pavimentos",
};

type Draft = {
  id: string;
  name: string;
  kind: ServiceMeasure["kind"];
  source: ServiceSource;
  axis: (typeof coordinates)[number];
  a: string;
  b: string;
  memberId: string;
  percent: string;
};

function toDraft(
  project: Project,
  source: ServiceSource,
  memberId: string,
  saved?: ServiceMeasure,
): Draft {
  return {
    id: saved?.id ?? uid(),
    name: saved?.name ?? nextName("Medida ", project.serviceMeasures ?? []),
    kind: saved?.kind ?? (project.members.length ? "chord" : "difference"),
    source: saved?.source ?? source,
    axis: saved?.axis ?? "z",
    a: saved && saved.kind !== "chord" ? saved.a : (project.nodes[0]?.id ?? ""),
    b: saved && saved.kind !== "chord" ? saved.b : (project.nodes[1]?.id ?? ""),
    memberId: saved?.kind === "chord" ? saved.memberId : memberId,
    percent: saved?.kind === "chord" ? String(saved.t * 100) : "50",
  };
}

function resolveDraft(draft: Draft): ServiceMeasure {
  const base = { id: draft.id, name: draft.name.trim(), source: draft.source };
  if (draft.kind === "chord") {
    const percent = parseUnitNumber(draft.percent);
    if (percent === null || percent < 0 || percent > 100)
      throw new Error(
        "Informe uma posição entre 0 e 100% do trecho deformável.",
      );
    return {
      ...base,
      kind: draft.kind,
      axis: draft.axis,
      memberId: draft.memberId,
      t: percent / 100,
    };
  }
  const ends = { a: draft.a, b: draft.b };
  if (draft.kind === "drift") {
    if (draft.axis === "z") throw new Error("Escolha uma direção horizontal.");
    return { ...base, ...ends, kind: draft.kind, axis: draft.axis };
  }
  return { ...base, ...ends, kind: draft.kind, axis: draft.axis };
}

type Props = {
  project: Project;
  cases: ReadonlyMap<string, AnalysisResult>;
  initialSource: ServiceSource;
  selectedMember?: string;
  revision: number;
  edit: (fn: (p: Project) => void) => string | null;
  close: () => void;
};

export function ServiceMeasuresDialog({
  project,
  cases,
  initialSource,
  selectedMember,
  revision,
  edit,
  close,
}: Props) {
  const { units } = useUnits();
  const dialog = useRef<HTMLDialogElement>(null);
  const memberId = selectedMember ?? project.members[0]?.id ?? "";
  const [draft, setDraft] = useState(() =>
    toDraft(project, initialSource, memberId, project.serviceMeasures?.[0]),
  );
  const [feedback, setFeedback] = useState("");
  const saved =
    project.serviceMeasures?.some(({ id }) => id === draft.id) ?? false;
  const update = (changes: Partial<Draft>) => {
    setDraft((before) => ({ ...before, ...changes }));
    setFeedback("");
  };
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const groups = [
    { kind: "case", label: "Casos estáticos", items: project.analysisCases },
    {
      kind: "combination",
      label: "Combinações",
      items: project.resultCombinations,
    },
    { kind: "envelope", label: "Envelopes", items: project.resultEnvelopes },
  ] as const;
  const group = groups.find((g) => g.kind === draft.source.kind)!;
  const source = group.items.find(({ id }) => id === draft.source.id);
  const sourceValue = `${draft.source.kind}:${draft.source.id}`;
  const definition = useMemo(() => {
    try {
      const measure = resolveDraft(draft);
      return { measure, geometry: serviceGeometry(project, measure) };
    } catch (error) {
      return { problem: (error as Error).message };
    }
  }, [project, draft]);
  const reading = useMemo(() => {
    if (!definition.measure) return null;
    try {
      return {
        values: evaluateServiceMeasure(project, definition.measure, cases),
      };
    } catch (error) {
      return { problem: (error as Error).message };
    }
  }, [project, definition.measure, cases]);
  const save = () => {
    const measure = definition.measure;
    if (!measure || !measure.name) return;
    const error = edit((p) => {
      const list = p.serviceMeasures ?? [];
      p.serviceMeasures = saved
        ? list.map((m) => (m.id === measure.id ? measure : m))
        : [...list, measure];
    });
    setFeedback(error ?? "Medida salva no projeto.");
  };
  const remove = () => {
    const error = edit((p) => {
      p.serviceMeasures = p.serviceMeasures?.filter(
        ({ id }) => id !== draft.id,
      );
    });
    if (error) setFeedback(error);
    else {
      setDraft(toDraft(project, initialSource, memberId));
      setFeedback("Medida excluída.");
    }
  };
  const axisOptions = coordinates.filter(
    (axis) =>
      !(axis === "y" && project.mode === "planar") &&
      !(axis === "z" && draft.kind === "drift"),
  );
  const span = definition.geometry;
  const formatPosition = (point: Point3) =>
    coordinates
      .map((key) => formatQuantity(point[key], "length", units))
      .join(" / ");
  const pointLabel = (node: StructuralNode, p: Point3) => {
    const level = project.guides.z.find(
      (g) => Math.abs(g.position - node.z) < 1e-6,
    );
    const diaphragm = project.diaphragms?.find((f) =>
      f.nodeIds.includes(node.id),
    );
    return `${node.name} [${node.id}] · (${formatPosition(p)}) ${units.length}${level ? ` · ${level.name}` : ""}${diaphragm ? ` · diafragma ${diaphragm.name}` : ""}`;
  };
  return (
    <dialog
      ref={dialog}
      className="slab-sizing-dialog service-measures"
      aria-label="Medidas de serviço"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <h2>Medidas de serviço</h2>
      <div className="service-fields">
        <label>
          Medida salva
          <select
            value={saved ? draft.id : ""}
            onChange={(event) => {
              setDraft(
                toDraft(
                  project,
                  initialSource,
                  memberId,
                  project.serviceMeasures?.find(
                    (v) => v.id === event.target.value,
                  ),
                ),
              );
              setFeedback("");
            }}
          >
            <option value="">Nova medida</option>
            {project.serviceMeasures?.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            setDraft(toDraft(project, initialSource, memberId));
            setFeedback("");
          }}
        >
          Nova medida
        </button>
        <label>
          Nome da medida{" "}
          <input
            maxLength={120}
            value={draft.name}
            onChange={(e) => update({ name: e.target.value })}
          />
        </label>
        <label>
          Tipo de medida
          <select
            value={draft.kind}
            onChange={(e) => {
              const kind = e.target.value as Draft["kind"];
              update({
                kind,
                axis: kind === "drift" && draft.axis === "z" ? "x" : draft.axis,
              });
            }}
          >
            {Object.entries(measureLabels).map(([id, label]) => (
              <option
                key={id}
                value={id}
                disabled={id === "chord" && !project.members.length}
              >
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Direção global
          <select
            value={draft.axis}
            onChange={(e) => update({ axis: e.target.value as Draft["axis"] })}
          >
            {axisOptions.map((axis) => (
              <option key={axis} value={axis}>
                {axis.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        <label>
          Origem dos resultados
          <select
            value={sourceValue}
            onChange={(e) => {
              const [kind, id] = e.target.value.split(":");
              update({ source: { kind: kind as ServiceSource["kind"], id } });
            }}
          >
            {!source && (
              <option value={sourceValue}>
                Origem removida [{draft.source.id}]
              </option>
            )}
            {groups.map(
              (g) =>
                g.items.length > 0 && (
                  <optgroup key={g.kind} label={g.label}>
                    {g.items.map((item) => (
                      <option key={item.id} value={`${g.kind}:${item.id}`}>
                        {item.name} [{item.id}]
                      </option>
                    ))}
                  </optgroup>
                ),
            )}
          </select>
        </label>
        {draft.kind === "chord" ? (
          <>
            <label>
              Barra da corda
              <select
                value={draft.memberId}
                onChange={(e) => update({ memberId: e.target.value })}
              >
                {!project.members.some((v) => v.id === draft.memberId) && (
                  <option value={draft.memberId}>
                    Selecione uma barra existente
                  </option>
                )}
                {project.members.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} [{v.id}]
                  </option>
                ))}
              </select>
            </label>
            <label>
              Posição da seção (% de i a j){" "}
              <input
                inputMode="decimal"
                value={draft.percent}
                onChange={(e) => update({ percent: e.target.value })}
              />
            </label>
          </>
        ) : (
          (["a", "b"] as const).map((end) => (
            <label key={end}>
              {draft.kind === "drift"
                ? end === "a"
                  ? "Nó inferior"
                  : "Nó superior"
                : end === "a"
                  ? "Nó A"
                  : "Nó B"}
              <select
                value={draft[end]}
                onChange={(e) => update({ [end]: e.target.value })}
              >
                {!project.nodes.some((v) => v.id === draft[end]) && (
                  <option value={draft[end]}>Selecione um nó existente</option>
                )}
                {project.nodes.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} [{v.id}]
                  </option>
                ))}
              </select>
            </label>
          ))
        )}
      </div>
      {span && (
        <>
          <dl className="service-reference">
            <dt>
              {span.kind === "chord" ? "Face i da corda" : "Referência A"}
            </dt>
            <dd>{pointLabel(span.a, span.from)}</dd>
            <dt>
              {span.kind === "chord" ? "Face j da corda" : "Referência B"}
            </dt>
            <dd>{pointLabel(span.b, span.to)}</dd>
            {span.kind === "chord" && (
              <>
                <dt>Seção consultada</dt>
                <dd>
                  ({formatPosition(span.position)}) {units.length} · x/L ={" "}
                  {formatResult(
                    definition.measure!.kind === "chord"
                      ? definition.measure!.t
                      : 0,
                  )}
                </dd>
              </>
            )}
            <dt>
              {draft.kind === "drift"
                ? "Altura entre os nós"
                : "Comprimento de referência"}
            </dt>
            <dd>
              {formatQuantity(span.referenceLength, "length", units)}{" "}
              {units.length}
            </dd>
          </dl>
          {draft.kind === "drift" && (
            <p>
              A deriva usa o deslocamento do nó superior menos o do inferior, no
              eixo escolhido, dividido pela altura. Nos diafragmas, a leitura
              usa o deslocamento do nó escolhido e inclui a parcela de rotação.
            </p>
          )}
        </>
      )}
      {definition.problem && <p role="alert">{definition.problem}</p>}
      {reading?.problem && <p role="status">{reading.problem}</p>}
      {reading?.values && (
        <ServiceReadings
          values={reading.values}
          revision={revision}
          units={units}
          measure={definition.measure!}
          sourceName={source?.name ?? ""}
        />
      )}
      {feedback && <p role="status">{feedback}</p>}
      <footer>
        {saved && (
          <button type="button" onClick={remove}>
            Excluir medida
          </button>
        )}
        <button
          type="button"
          onClick={save}
          disabled={
            !definition.measure?.name ||
            !source ||
            (!saved && (project.serviceMeasures?.length ?? 0) >= 100)
          }
        >
          Salvar medida
        </button>
        <button type="button" onClick={close}>
          Fechar medidas
        </button>
      </footer>
    </dialog>
  );
}

function ServiceReadings({
  values,
  revision,
  units,
  measure,
  sourceName,
}: {
  values: ReturnType<typeof evaluateServiceMeasure>;
  revision: number;
  units: UnitPreferences;
  measure: ServiceMeasure;
  sourceName: string;
}) {
  const env = measure.source.kind === "envelope";
  const chord = measure.kind === "chord";
  const rows = env
    ? [
        { type: "Mínimo", value: values.min },
        { type: "Máximo", value: values.max },
      ]
    : [{ type: "Valor", value: values.results[0] }];
  const fmt = (v: number) => formatResultQuantity(v, "displacement", units);
  return (
    <>
      <p>
        {sourceName} · Revisão {revision} · Direção {measure.axis.toUpperCase()}{" "}
        global · {rows[0].value.method}
      </p>
      <div className="service-table">
        <table aria-label="Resultados da medida">
          <thead>
            <tr>
              <th>Medida</th>
              <th>Origem</th>
              <th>
                {chord ? "Face i" : "Nó A"} ({units.displacement})
              </th>
              <th>
                {chord ? "Face j" : "Nó B"} ({units.displacement})
              </th>
              {chord && (
                <>
                  <th>Seção ({units.displacement})</th>
                  <th>Corda ({units.displacement})</th>
                </>
              )}
              <th>Relativo ({units.displacement})</th>
              {measure.kind === "drift" && <th>Deriva (%)</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ type, value }) => (
              <tr key={type}>
                <td>{type}</td>
                <td>
                  {value.name} [{value.id}]
                </td>
                <td>{fmt(value.a)}</td>
                <td>{fmt(value.b)}</td>
                {chord && (
                  <>
                    <td>{fmt(value.absolute)}</td>
                    <td>{fmt(value.reference)}</td>
                  </>
                )}
                <td>{fmt(value.delta)}</td>
                {value.ratio !== null && (
                  <td>{formatResult(100 * value.ratio, 8)}%</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
