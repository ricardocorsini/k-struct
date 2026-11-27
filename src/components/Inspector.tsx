import { SlabPressureDialog } from "./SurfacePressureFields";
import {
  directionNames,
  slabPressureVertices,
  remapSlabPressures,
  type PressureSpec,
} from "../domain/surfacePressure";
import {
  emptyThermal,
  sectionExtents,
  setThermalField,
} from "../domain/thermalLoads";
import SlabMeshControl from "./SlabMeshControl";
import SlabContourFields from "./SlabContourFields";
import MemberOffsetsEditor from "./MemberOffsetsEditor";
import { memberAxis, setOffsets } from "../domain/memberOffsets";
import SectionPreview from "./SectionPreview";
import {
  dimensions,
  geometryErrors,
  sectionProperties,
  shapeNames,
} from "../domain/sections";
import {
  activeStiffnessComponents,
  grossStiffness,
  memberStiffnessError,
  setStiffnessFactor,
  stiffnessLabels,
} from "../domain/memberStiffness";
import MaterialProperties from "./MaterialProperties";
import { useEffect, useRef, useState } from "react";
import {
  Box,
  CircleDot,
  MoveRight,
  SlidersHorizontal,
  Square,
} from "lucide-react";
import {
  beamAxes,
  coordinates,
  localComponents,
  tolerance,
} from "../domain/geometry";
import { hingeMemberEnds, reverseMember } from "../domain/editing";
import { setPrescribedMotion } from "../domain/prescribedMotions";
import { setRigidSupport, setSpring } from "../domain/supports";
import {
  free,
  defaultEndConnection,
  nodalLoad,
  slabDivisionLimit,
  uniformLoad,
  type NodalLoad,
  type UniformLoad,
  type Project,
  type EndConnection,
  type SelectedObject,
  type Slab,
} from "../domain/model";
import { parseNumberInput } from "./numberInput";
import {
  formatQuantity,
  formatUnitInput,
  parseUnitInput,
  unitLabel,
  fromSI,
  type MeasuredQuantity,
} from "../units";
import { useUnits } from "./Units";
import { pointLoadLabel } from "./PointLoadGlyph";
import type { MemberLoadSelection } from "./memberLoadInput";
import { distributedLoadLabel } from "./DistributedLoadGlyph";
import FoundationDialog from "./FoundationDialog";
import SupportFrameEditor from "./SupportFrameEditor";
import BatchAssignPanel from "./BatchAssignPanel";
import { selectionKey } from "../domain/selection";

const stiffnessNumber = new Intl.NumberFormat("pt-BR", {
  maximumSignificantDigits: 7,
});

export function NumberField({
  label,
  value,
  unit,
  quantity,
  onChange,
  min,
  max,
  integer = false,
  disabled = false,
  validate,
}: {
  label: string;
  value: number;
  unit?: string;
  quantity?: MeasuredQuantity;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  integer?: boolean;
  disabled?: boolean;
  validate?: (value: number) => string | undefined;
}) {
  const { units } = useUnits();
  const displayValue = () =>
    quantity ? formatUnitInput(value, quantity, units) : String(value);
  const [draft, setDraft] = useState(displayValue),
    [invalid, setInvalid] = useState(false);
  const [detail, setDetail] = useState<string>();
  const cancelling = useRef(false);
  useEffect(() => {
    setDraft(displayValue());
    setInvalid(false);
    setDetail(undefined);
  }, [value, quantity, units, disabled]);
  const commit = () => {
    if (cancelling.current) {
      cancelling.current = false;
      return;
    }
    const n = quantity
      ? (parseUnitInput(draft, quantity, units, value) ?? NaN)
      : parseNumberInput(draft);
    const error = validate?.(n);
    setDetail(error);
    if (
      error ||
      !Number.isFinite(n) ||
      (integer && !Number.isInteger(n)) ||
      (min !== undefined && n < min) ||
      (max !== undefined && n > max)
    ) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (n !== value) onChange(n);
  };
  return (
    <label className="number-field">
      <span>{label}</span>
      <div>
        <input
          aria-label={label}
          aria-invalid={invalid}
          disabled={disabled}
          inputMode={integer ? "numeric" : "decimal"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              cancelling.current = true;
              setDraft(displayValue());
              setInvalid(false);
              setDetail(undefined);
              e.currentTarget.blur();
            }
          }}
        />
        {(quantity || unit) && (
          <small>{quantity ? unitLabel(quantity, units) : unit}</small>
        )}
      </div>
      {invalid && (
        <em>
          {detail ??
            `${integer ? "Informe um número inteiro" : "Informe um valor válido"}${min !== undefined ? ` (mín. ${quantity ? formatQuantity(min, quantity, units) : min})` : ""}.`}
        </em>
      )}
    </label>
  );
}

const nodalComponents = ["fx", "fy", "fz", "mx", "my", "mz"] as const;
const uniformComponents = ["qx", "qy", "qz"] as const;
type Pattern = Project["loadPatterns"][number];

function sumNodal(pattern: Pattern, id: string) {
  const values = nodalLoad(id);
  for (const load of pattern.nodal)
    if (load.nodeId === id)
      for (const key of nodalComponents) values[key] += load[key];
  return values;
}

function sumUniform(pattern: Pattern, id: string) {
  const values = uniformLoad(id);
  for (const load of pattern.uniform)
    if (load.memberId === id)
      for (const key of uniformComponents) values[key] += load[key];
  return values;
}

function SlabFields({
  project,
  slab,
  pattern,
  edit,
  onMaterials,
}: {
  project: Project;
  slab: Slab;
  pattern: Pattern;
  edit: (fn: (p: Project) => void) => void;
  onMaterials: () => void;
}) {
  const { units } = useUnits();
  const material = project.materials.find(({ id }) => id === slab.materialId)!;
  const updateSlab = (changes: Partial<Slab>) =>
    edit((draft) => {
      const next = draft.slabs.find(({ id }) => id === slab.id)!;
      Object.assign(next, changes);
      if (
        changes.polygon?.rings &&
        changes.polygon.rings !== slab.polygon?.rings
      )
        remapSlabPressures(draft, slab, next);
    });
  const joint = project.slabJoint;
  const shared =
    joint?.a.slabId === slab.id
      ? joint.a.edgeId
      : joint?.b.slabId === slab.id
        ? joint.b.edgeId
        : undefined;
  const action = pattern.pressure.find((v) => v.slabId === slab.id);
  const [areaOpen, setAreaOpen] = useState(false);
  const vertices = slabPressureVertices(
    slab,
    project.guides.z.find((v) => v.id === slab.levelId)!.position,
  );
  const saveArea = (uniform: number, spec: PressureSpec) =>
    edit((draft) => {
      const pat = draft.loadPatterns.find((v) => v.id === pattern.id)!;
      pat.pressure = pat.pressure.filter((v) => v.slabId !== slab.id);
      if (uniform || spec.distribution)
        pat.pressure.push({ slabId: slab.id, pz: uniform, ...spec });
    });
  return (
    <>
      <label className="stack-field">
        Nome da laje
        <input
          value={slab.name}
          maxLength={120}
          onChange={(e) => {
            if (e.target.value.trim()) updateSlab({ name: e.target.value });
          }}
        />
      </label>
      <label className="stack-field">
        Pavimento da laje
        <select
          value={slab.levelId}
          onChange={(e) => updateSlab({ levelId: e.target.value })}
        >
          {project.guides.z.map((level) => (
            <option key={level.id} value={level.id}>
              {level.name} · {formatQuantity(level.position, "length", units)}{" "}
              {units.length}
            </option>
          ))}
        </select>
      </label>
      <h4>Geometria da laje</h4>
      {slab.polygon ? (
        <SlabContourFields
          sharedEdge={shared}
          slab={slab}
          update={(rings, split) => {
            const ids = new Set(rings.flat().map((v) => v.edgeId));
            const edges =
              slab.sizing?.edges.filter((e) => ids.has(e.edgeId)) ?? [];
            const inherited =
              split && edges.find((e) => e.edgeId === split.from);
            if (inherited && split)
              edges.push({ edgeId: split.to, size: inherited.size });
            return updateSlab({
              polygon: { ...slab.polygon, rings },
              ...(slab.sizing ? { sizing: { ...slab.sizing, edges } } : {}),
            });
          }}
        />
      ) : (
        (
          [
            ["x", "X inicial"],
            ["y", "Y inicial"],
            ["lengthX", "Lado X"],
            ["lengthY", "Lado Y"],
          ] as const
        ).map(([key, label]) => (
          <NumberField
            key={key}
            label={label}
            value={slab[key]}
            quantity="length"
            min={key === "lengthX" || key === "lengthY" ? tolerance : undefined}
            onChange={(value) => updateSlab({ [key]: value })}
          />
        ))
      )}
      <NumberField
        label="Espessura"
        quantity="section"
        min={0.000001}
        value={slab.thickness}
        onChange={(value) => updateSlab({ thickness: value })}
      />
      <h4>Material elástico isotrópico</h4>
      <label className="stack-field">
        Material da laje
        <select
          value={material.id}
          onChange={(e) => updateSlab({ materialId: e.target.value })}
        >
          {project.materials.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <MaterialProperties material={material} />
      <button onClick={onMaterials}>Abrir material na biblioteca</button>
      {slab.polygon ? (
        <>
          <h4>Malha de análise</h4>
          <label className="stack-field">
            Refinamento DKT
            <select
              disabled={!!slab.sizing}
              value={slab.polygon.refinements}
              onChange={(e) =>
                updateSlab({
                  polygon: { ...slab.polygon, refinements: +e.target.value },
                })
              }
            >
              {[1, 2, 3].map((i) => (
                <option key={i} value={i}>
                  {2 ** i} divisões por lado do triângulo inicial
                </option>
              ))}
            </select>
          </label>
        </>
      ) : (
        <>
          <h4>Apoios de borda</h4>
          <p className="help">
            Marque as bordas com apoio simples. Bordas desmarcadas ficam livres.
            Use pelo menos duas bordas apoiadas.
          </p>
          <div className="restraints">
            {(
              [
                ["xMin", "X mín."],
                ["xMax", "X máx."],
                ["yMin", "Y mín."],
                ["yMax", "Y máx."],
              ] as const
            ).map(([edge, label]) => (
              <label key={edge}>
                <input
                  type="checkbox"
                  disabled={shared === edge}
                  checked={
                    shared === edge
                      ? joint?.support !== "none"
                      : slab.supports[edge]
                  }
                  aria-label={`Apoio simples na borda ${label}`}
                  onChange={(e) =>
                    updateSlab({
                      supports: { ...slab.supports, [edge]: e.target.checked },
                    })
                  }
                />
                Borda {label}
                {shared === edge ? " · vínculo entre lajes" : ""}
              </label>
            ))}
          </div>
          <h4>Malha de análise</h4>
          <label className="stack-field">
            Elemento de placa
            <select
              value={slab.formulation}
              onChange={(e) =>
                updateSlab({
                  formulation: e.target.value === "dkt" ? "dkt" : "qdkt",
                })
              }
            >
              <option value="qdkt">Quadrilateral QDKT</option>
              <option value="dkt">Triangular DKT</option>
            </select>
          </label>
          {(
            [
              ["divisionsX", "Subdivisões em X"],
              ["divisionsY", "Subdivisões em Y"],
            ] as const
          ).map(([key, label]) => (
            <NumberField
              key={key}
              label={label}
              value={slab[key]}
              disabled={!!slab.sizing}
              min={2}
              max={slabDivisionLimit}
              integer
              onChange={(value) => updateSlab({ [key]: value })}
            />
          ))}
          <p className="help">
            {slab.sizing
              ? "Malha por tamanho-alvo"
              : slab.formulation === "qdkt"
                ? `${slab.divisionsX * slab.divisionsY} quadriláteros QDKT`
                : `${2 * slab.divisionsX * slab.divisionsY} triângulos DKT`}
          </p>
        </>
      )}
      <SlabMeshControl
        slab={slab}
        onApply={(sizing) => updateSlab({ sizing })}
      />
      <h4>
        Carga superficial <span>{pattern.name}</span>
      </h4>
      {!action?.distribution && (
        <NumberField
          label="Pressão pZ"
          unit="kN/m²"
          value={(action?.pz ?? 0) / 1000}
          onChange={(value) =>
            saveArea(
              value * 1000,
              action?.direction ? { direction: action.direction } : {},
            )
          }
        />
      )}
      {action?.distribution && (
        <p>
          {action.distribution.mode === "elevation"
            ? "Por cota Z"
            : "Por vértice"}{" "}
          · {directionNames[action.direction ?? "normal"]}
        </p>
      )}
      <button type="button" onClick={() => setAreaOpen(true)}>
        Configurar carga superficial
      </button>
      {areaOpen && (
        <SlabPressureDialog
          vertices={vertices}
          spec={action}
          uniform={action?.pz ?? 0}
          apply={saveArea}
          close={() => setAreaOpen(false)}
        />
      )}
      <p className="help">
        Use pZ negativo para pressão descendente. O peso próprio pode ser
        ativado nas definições do padrão.
      </p>
    </>
  );
}

export default function Inspector({
  project: p,
  selection,
  patternId,
  onPatternChange,
  edit,
  onMaterials,
  onSections,
  onMemberLoad,
}: {
  project: Project;
  selection: SelectedObject[];
  patternId: string;
  onPatternChange: (id: string) => void;
  edit: (fn: (p: Project) => void) => string | null | void;
  onMaterials: () => void;
  onSections: (id: string) => void;
  onMemberLoad: (selection: MemberLoadSelection) => void;
}) {
  const { units } = useUnits();
  const [angleUnit, setAngleUnit] = useState("mrad");
  const [foundationId, setFoundationId] = useState<string>();
  const single = selection.length === 1 ? selection[0] : null;
  const spatial = p.mode === "spatial";
  const dofs = spatial
    ? (["ux", "uy", "uz", "rx", "ry", "rz"] as const)
    : (["ux", "uz", "ry"] as const);
  const axes = spatial ? coordinates : (["x", "z"] as const);
  const node =
    single?.kind === "node"
      ? p.nodes.find((n) => n.id === single.id)
      : undefined;
  const member =
    single?.kind === "member"
      ? p.members.find((m) => m.id === single.id)
      : undefined;
  const slab =
    single?.kind === "slab"
      ? p.slabs.find(({ id }) => id === single.id)
      : undefined;
  const section = p.sections.find(
    (s) => s.id === (member?.sectionId ?? p.sections[0].id),
  )!;
  const material = p.materials.find((m) => m.id === section.materialId)!;
  const geometry = member && sectionProperties(section);
  const gross = geometry && grossStiffness(geometry, material);
  const pattern = p.loadPatterns.find((l) => l.id === patternId)!;
  const nl = sumNodal(pattern, node?.id ?? "");
  const temperature =
    member &&
    (pattern.thermal?.find((f) => f.memberId === member.id) ??
      emptyThermal(member.id));
  const extents = sectionExtents(section);
  const ul = sumUniform(pattern, member?.id ?? "");
  const updateMemberConnection = (
    end: "i" | "j",
    dof: keyof EndConnection,
    kind: "rigid" | "free" | "elastic",
    stiffness = 0,
  ) =>
    edit((draft) => {
      const target = draft.members.find((item) => item.id === member?.id)!;
      const key = end === "i" ? "connectionI" : "connectionJ";
      const connection = target[key] ?? defaultEndConnection();
      connection[dof] = kind === "elastic" ? { kind, stiffness } : { kind };
      target[key] = connection;
    });
  const start = member && p.nodes.find((n) => n.id === member.start)!;
  const end = member && p.nodes.find((n) => n.id === member.end)!;
  const line =
    member && start && end ? memberAxis(member, start, end) : undefined;
  const span = line?.span ?? 0;
  const localLoad =
    member && line && span >= tolerance
      ? localComponents(
          { x: ul.qx, y: ul.qy, z: ul.qz },
          beamAxes(line.start, line.end, member.roll, p.mode),
        )
      : undefined;
  const nodeLoad = (key: Exclude<keyof NodalLoad, "nodeId">, value: number) =>
    edit((p) => {
      const pat = p.loadPatterns.find((l) => l.id === patternId)!;
      const next = sumNodal(pat, node!.id);
      if (next[key] === value) return;
      next[key] = value;
      pat.nodal = pat.nodal.filter((l) => l.nodeId !== node!.id);
      if (nodalComponents.some((k) => next[k])) pat.nodal.push(next);
    });
  const setUniformLoad = (
    key: Exclude<keyof UniformLoad, "memberId">,
    value: number,
  ) =>
    edit((p) => {
      const pat = p.loadPatterns.find((l) => l.id === patternId)!;
      const next = sumUniform(pat, member!.id);
      if (next[key] === value) return;
      next[key] = value;
      pat.uniform = pat.uniform.filter((l) => l.memberId !== member!.id);
      if (uniformComponents.some((k) => next[k])) pat.uniform.push(next);
    });
  const selectedNodes = new Set(
    selection.filter((s) => s.kind === "node").map((s) => s.id),
  );
  const selectedMembers = new Set(
    selection.filter(({ kind }) => kind === "member").map(({ id }) => id),
  );
  const hingeEnds = (
    <>
      <button
        onClick={() => edit((draft) => hingeMemberEnds(draft, selectedMembers))}
      >
        Articular as duas extremidades
      </button>
      {spatial && (
        <p className="help">
          Libera Ry e Rz nas duas pontas e Rx somente em i. A torção fica rígida
          em j.
        </p>
      )}
    </>
  );
  const applyRestraints = (fixed: boolean) =>
    edit((p) => {
      for (const n of p.nodes) {
        if (!selectedNodes.has(n.id)) continue;
        n.restraints = free();
        delete n.springs;
        delete n.foundation;
        for (const k of dofs) n.restraints[k] = fixed;
      }
    });
  const supportPresets = (
    <div className="support-presets">
      <button onClick={() => applyRestraints(true)}>
        {node ? "Engastar nó" : "Engastar nós"}
      </button>
      <button onClick={() => applyRestraints(false)}>Liberar apoios</button>
    </div>
  );
  return (
    <aside className="inspector">
      <div className="panel-title">
        <SlidersHorizontal size={15} />
        Propriedades
      </div>
      <div className="inspector-scroll" key={single?.id ?? "default"}>
        <div className="object-heading">
          <div className="object-icon">
            {node ? (
              <CircleDot />
            ) : member ? (
              <MoveRight />
            ) : slab ? (
              <Square />
            ) : (
              <Box />
            )}
          </div>
          <div>
            <small>
              {node
                ? "NÓ ESTRUTURAL"
                : member
                  ? "BARRA ESTRUTURAL"
                  : slab
                    ? "LAJE RETANGULAR"
                    : "MODELO"}
            </small>
            <h3>
              {node?.name ??
                member?.name ??
                slab?.name ??
                (selection.length > 1
                  ? "Seleção múltipla"
                  : "Definições iniciais")}
            </h3>
          </div>
        </div>
        {selection.length > 1 && (
          <>
            <p className="help">
              {selectedNodes.size} nós · {selectedMembers.size} barras
              {selection.some(({ kind }) => kind === "slab") && " · 1 laje"}
            </p>
            {selectedNodes.size > 0 && supportPresets}
            {selectedMembers.size > 0 && hingeEnds}
            <BatchAssignPanel
              key={JSON.stringify([
                p.mode,
                patternId,
                units.force,
                units.moment,
                units.distributedLoad,
                ...selection.map(selectionKey),
              ])}
              project={p}
              selection={selection}
              patternId={patternId}
              edit={edit}
            />
          </>
        )}
        {!selection.length && (
          <p className="help">
            Selecione um objeto em qualquer vista para editar suas propriedades.
          </p>
        )}
        {node && (
          <>
            <h4>Coordenadas globais</h4>
            {axes.map((k) => (
              <NumberField
                key={k}
                label={k.toUpperCase()}
                value={node[k]}
                quantity="length"
                onChange={(v) =>
                  edit((p) => {
                    p.nodes.find((n) => n.id === node.id)![k] = v;
                  })
                }
              />
            ))}
            {!spatial && (
              <div className="property-line">
                <span>Y</span>
                <b>0,00 {units.length}</b>
              </div>
            )}
            <h4>Apoios e restrições</h4>
            {spatial && (
              <button onClick={() => setFoundationId(node.id)}>
                {node.foundation
                  ? `Fundação · ${node.foundation.name}`
                  : "Importar fundação do MolaStruct"}
              </button>
            )}
            {spatial && foundationId === node.id && (
              <FoundationDialog
                key={node.id}
                node={node}
                edit={edit}
                onClose={() => setFoundationId(undefined)}
              />
            )}

            <SupportFrameEditor
              mode={p.mode}
              frame={node.supportFrame}
              onChange={(frame) =>
                edit((draft) => {
                  const target = draft.nodes.find(({ id }) => id === node.id)!;
                  if (frame) target.supportFrame = frame;
                  else delete target.supportFrame;
                })
              }
            />
            <p className="help">Marque os graus de liberdade impedidos.</p>
            <div className="restraints">
              {dofs.map((k) => (
                <label key={k}>
                  <input
                    type="checkbox"
                    aria-label={`Restringir ${k}${node.supportFrame ? " local" : ""}`}
                    checked={node.restraints[k]}
                    onChange={(e) =>
                      edit((p) => {
                        setRigidSupport(
                          p.nodes.find((n) => n.id === node.id)!,
                          k,
                          e.target.checked,
                        );
                      })
                    }
                  />
                  <span>
                    {`${k[0] === "r" ? "Rotação" : "Translação"} ${k[1].toUpperCase()}`}
                    {node.supportFrame && " local"}
                    {node.supportFrame?.kind === "planar" &&
                      (k === "ux"
                        ? " · tangente"
                        : k === "uz"
                          ? " · normal"
                          : "")}
                  </span>
                </label>
              ))}
            </div>
            {supportPresets}
            <details className="nodal-springs">
              <summary>Molas nodais</summary>
              <p className="help">
                As molas seguem o referencial do apoio. Zero deixa a direção
                livre. Desmarque a restrição rígida da direção para editar sua
                mola.
              </p>
              {dofs.map((key) => (
                <NumberField
                  key={key}
                  label={`Rigidez ${key.toUpperCase()} ${node.supportFrame ? "local" : "global"}`}
                  quantity={
                    key[0] === "u"
                      ? "translationStiffness"
                      : "rotationStiffness"
                  }
                  value={node.springs?.[key] ?? 0}
                  disabled={node.restraints[key]}
                  min={0}
                  onChange={(value) =>
                    edit((draft) => {
                      setSpring(
                        draft.nodes.find(({ id }) => id === node.id)!,
                        key,
                        value,
                      );
                    })
                  }
                />
              ))}
            </details>
            <details className="nodal-springs" key={`motions-${node.id}`}>
              <summary>
                Movimentos prescritos
                {pattern.prescribed?.some((r) => r.nodeId === node.id) &&
                  ` · ${pattern.name}`}
              </summary>
              <p className="help">
                Informe o movimento conhecido no referencial{" "}
                {node.supportFrame ? "local do apoio" : "global"}. O sinal segue
                o sentido positivo do eixo. Zero restabelece a condição imóvel
                nesse padrão.
              </p>
              <label className="stack-field">
                Padrão do movimento
                <select
                  value={patternId}
                  onChange={(e) => onPatternChange(e.target.value)}
                >
                  {p.loadPatterns.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              {dofs.some((k) => k[0] === "r" && node.restraints[k]) && (
                <label className="stack-field">
                  Unidade de rotação
                  <select
                    value={angleUnit}
                    onChange={(e) => setAngleUnit(e.target.value)}
                  >
                    <option value="mrad">mrad</option>
                    <option value="rad">rad</option>
                  </select>
                </label>
              )}
              {dofs.map((dof) => {
                const rotation = dof[0] === "r";
                const factor = rotation && angleUnit === "mrad" ? 1000 : 1;
                const motion = pattern.prescribed?.find(
                  (r) => r.nodeId === node.id && r.dof === dof,
                );
                return (
                  <NumberField
                    key={`${node.id}-${patternId}-${dof}-${angleUnit}`}
                    label={`${dof.toUpperCase()} imposto ${node.supportFrame ? "local" : "global"}`}
                    disabled={!node.restraints[dof]}
                    quantity={rotation ? undefined : "displacement"}
                    unit={rotation ? angleUnit : undefined}
                    value={(motion?.value ?? 0) * factor}
                    onChange={(value) =>
                      edit((draft) =>
                        setPrescribedMotion(
                          draft.loadPatterns.find(
                            (item) => item.id === patternId,
                          )!,
                          { nodeId: node.id, dof, value: value / factor },
                        ),
                      )
                    }
                  />
                );
              })}
            </details>
            <h4>
              Carga nodal <span>{pattern.name}</span>
            </h4>
            {(spatial ? nodalComponents : (["fx", "fz", "my"] as const)).map(
              (k) => (
                <NumberField
                  key={`${patternId}-${k}`}
                  label={`${k[0] === "f" ? "Força" : "Momento"} ${k[1].toUpperCase()}`}
                  value={nl[k]}
                  quantity={k[0] === "f" ? "force" : "moment"}
                  onChange={(v) => nodeLoad(k, v)}
                />
              ),
            )}
            <p className="help">
              Z positivo para cima. Momentos globais pela regra da mão direita.
            </p>
          </>
        )}
        {member && (
          <>
            <label className="stack-field">
              Nome da barra
              <input
                key={member.name}
                defaultValue={member.name}
                maxLength={120}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
                onBlur={(e) => {
                  const name = e.currentTarget.value.trim();
                  if (!name || name === member.name) {
                    e.currentTarget.value = member.name;
                    return;
                  }
                  edit((draft) => {
                    draft.members.find((m) => m.id === member.id)!.name = name;
                  });
                }}
              />
            </label>
            <h4>Conectividade</h4>
            <div className="property-line">
              <span>Sentido i → j</span>
              <b>
                {start?.name} → {end?.name}
              </b>
            </div>
            <div className="property-line">
              <span>{member.offsets ? "Eixo de inserção" : "Comprimento"}</span>
              <b>
                {formatQuantity(span, "length", units)} {units.length}
              </b>
            </div>
            <button
              onClick={() => edit((draft) => reverseMember(draft, member.id))}
            >
              Inverter i/j
            </button>
            <p className="help">
              A inversão conserva a orientação física da seção e as cargas
              globais.
            </p>
            <h4>Ligações nas extremidades</h4>
            {hingeEnds}
            <p className="help">
              Escolha o vínculo de cada componente nos eixos locais da barra.
            </p>
            {(
              [
                ["ux", "Ux"],
                ...(spatial ? [["uy", "Uy"]] : []),
                ["uz", "Uz"],
                ...(spatial ? [["rx", "Rx"]] : []),
                ["ry", "Ry"],
                ...(spatial ? [["rz", "Rz"]] : []),
              ] as [keyof EndConnection, string][]
            ).map(([dof, label]) =>
              (["i", "j"] as const).map((end) => {
                const value = member[
                  end === "i" ? "connectionI" : "connectionJ"
                ]?.[dof] ?? { kind: "rigid" as const };
                const component = value.kind === "elastic" ? value : null;
                return (
                  <div className="connection-editor" key={`${end}-${dof}`}>
                    <label className="stack-field">
                      Ligação {end} · {label}
                      <select
                        aria-label={`Ligação ${end} · ${label}`}
                        value={value.kind}
                        onChange={(event) =>
                          updateMemberConnection(
                            end,
                            dof,
                            event.target.value as "rigid" | "free" | "elastic",
                            component?.stiffness ?? 1,
                          )
                        }
                      >
                        <option value="rigid">Rígida</option>
                        <option value="free">Livre</option>
                        <option value="elastic">Elástica</option>
                      </select>
                    </label>
                    {component && (
                      <NumberField
                        label={`Rigidez ${end} · ${label}`}
                        quantity={
                          dof.startsWith("r")
                            ? "rotationStiffness"
                            : "translationStiffness"
                        }
                        value={component.stiffness}
                        validate={(v) =>
                          v > 0 ? undefined : "Informe uma rigidez positiva."
                        }
                        onChange={(value) =>
                          updateMemberConnection(end, dof, "elastic", value)
                        }
                      />
                    )}
                  </div>
                );
              }),
            )}
            <label className="stack-field">
              Seção
              <select
                aria-label="Seção da barra"
                value={member.sectionId}
                onChange={(e) =>
                  edit((p) => {
                    p.members.find((m) => m.id === member.id)!.sectionId =
                      e.target.value;
                  })
                }
              >
                {p.sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            {spatial ? (
              <NumberField
                label="Rotação em torno de x local"
                value={member.roll}
                unit="°"
                min={-360}
                max={360}
                onChange={(v) =>
                  edit((p) => {
                    p.members.find((m) => m.id === member.id)!.roll = v;
                  })
                }
              />
            ) : (
              <div className="property-line">
                <span>Rotação da seção em XZ</span>
                <b>0°</b>
              </div>
            )}
            {start && end && (
              <MemberOffsetsEditor
                member={member}
                start={start}
                end={end}
                mode={p.mode}
                onApply={(offsets) =>
                  edit((draft) =>
                    setOffsets(
                      draft.members.find((m) => m.id === member.id)!,
                      offsets,
                    ),
                  )
                }
              />
            )}
            <h4>
              Cargas concentradas <span>{pattern.name}</span>
            </h4>
            {(pattern.points ?? [])
              .filter((l) => l.memberId === member.id)
              .map((load) => (
                <button
                  key={load.id}
                  className="point-load-entry"
                  onClick={() =>
                    onMemberLoad({
                      memberId: member.id,
                      loadId: load.id,
                      fraction: 0,
                    })
                  }
                >
                  {pointLoadLabel(load, span, units)}
                </button>
              ))}
            <button
              onClick={() =>
                onMemberLoad({ memberId: member.id, fraction: 0.5 })
              }
            >
              Adicionar carga concentrada
            </button>
            <h4>
              Cargas por trecho <span>{pattern.name}</span>
            </h4>
            {(pattern.distributed ?? [])
              .filter((l) => l.memberId === member.id)
              .map((load) => (
                <button
                  key={load.id}
                  className="point-load-entry"
                  onClick={() =>
                    onMemberLoad({
                      kind: "distributed",
                      memberId: member.id,
                      loadId: load.id,
                      fraction: 0,
                    })
                  }
                >
                  {distributedLoadLabel(load, span, units)}
                </button>
              ))}
            <button
              onClick={() =>
                onMemberLoad({
                  kind: "distributed",
                  memberId: member.id,
                  fraction: 0,
                })
              }
            >
              Adicionar carga por trecho
            </button>
            {temperature && (
              <details className="nodal-springs">
                <summary>Ação térmica</summary>
                <label className="stack-field">
                  Padrão da ação térmica
                  <select
                    value={patternId}
                    onChange={(e) => onPatternChange(e.target.value)}
                  >
                    {p.loadPatterns.map((pat) => (
                      <option key={pat.id} value={pat.id}>
                        {pat.name}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="help">
                  {material.name} · α ={" "}
                  {material.alpha.toLocaleString("pt-BR", {
                    maximumSignificantDigits: 8,
                  })}{" "}
                  1/K.
                  {material.alpha === 0 &&
                    " Com α igual a zero, não há deformação térmica."}
                </p>
                <p className="help">
                  A variação uniforme aquece (+) ou resfria (−) toda a seção. A
                  diferença entre faces é a temperatura da face positiva menos a
                  da face negativa do eixo local. Uma variação de 1 K equivale a
                  1 °C.
                </p>
                {(
                  [
                    "uniform",
                    "deltaZ",
                    ...(spatial ? ["deltaY" as const] : []),
                  ] as const
                ).map((k) => (
                  <NumberField
                    key={`${member.id}-${patternId}-${k}`}
                    label={
                      k === "uniform"
                        ? "ΔT uniforme"
                        : `ΔT entre faces ${k === "deltaZ" ? "z" : "y"}`
                    }
                    unit="K"
                    value={temperature[k]}
                    onChange={(value) =>
                      edit((draft) => {
                        const target = draft.loadPatterns.find(
                          (pat) => pat.id === patternId,
                        )!;
                        const field =
                          target.thermal?.find(
                            (f) => f.memberId === member.id,
                          ) ?? emptyThermal(member.id);
                        setThermalField(target, { ...field, [k]: value });
                      })
                    }
                  />
                ))}
                <p className="help">
                  Distância entre faces z:{" "}
                  {formatQuantity(extents.height, "section", units)}{" "}
                  {units.section}
                  {spatial &&
                    ` · entre faces y: ${formatQuantity(extents.width, "section", units)} ${units.section}`}
                  .
                </p>
              </details>
            )}
            <h4>
              Carga distribuída uniforme <span>{pattern.name}</span>
            </h4>
            {axes.map((k) => (
              <NumberField
                key={`${patternId}-${k}`}
                label={`q${k.toUpperCase()} global`}
                quantity="distributedLoad"
                value={ul[`q${k}`]}
                onChange={(v) => setUniformLoad(`q${k}`, v)}
              />
            ))}
            {localLoad && (
              <dl
                className="material-values"
                aria-label="Projeção local da carga distribuída"
              >
                {axes.map((key) => (
                  <div key={key}>
                    <dt>q{key} local</dt>
                    <dd>
                      {formatQuantity(
                        Math.abs(localLoad[key]) < 1e-8 ? 0 : localLoad[key],
                        "distributedLoad",
                        units,
                      )}{" "}
                      {units.distributedLoad}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            <p className="help">
              Carga uniforme por metro do eixo de inserção, incluindo os trechos
              rígidos. Use qZ negativo para cargas verticais descendentes.
            </p>
          </>
        )}
        {slab && (
          <SlabFields
            project={p}
            slab={slab}
            pattern={pattern}
            edit={edit}
            onMaterials={onMaterials}
          />
        )}
        {!slab &&
          !node &&
          selection.length < 2 &&
          (member || !p.slabs.length) && (
            <>
              <h4>
                {shapeNames[section.shape]} · {section.name}
              </h4>
              <p className="help">
                Alterações se aplicam a todas as barras que usam esta seção.
              </p>
              {dimensions(section).map(({ key, label, value }) => (
                <NumberField
                  key={`${section.id}-${key}`}
                  label={label}
                  quantity="section"
                  value={value}
                  validate={(v) =>
                    Object.values(geometryErrors({ ...section, [key]: v }))[0]
                  }
                  onChange={(v) =>
                    edit((draft) => {
                      Object.assign(
                        draft.sections.find((s) => s.id === section.id)!,
                        { [key]: v },
                      );
                    })
                  }
                />
              ))}
              <SectionPreview geometry={section} roll={member?.roll} />
              {member && geometry && gross && (
                <details className="member-stiffness">
                  <summary>Modificadores de rigidez</summary>
                  <p className="help">
                    {spatial
                      ? "EA axial em x, EIy e EIz em flexão nos eixos locais y e z, GJ em torção em x."
                      : "EA axial em x local e EIy em flexão em torno de y local."}{" "}
                    Use fatores adimensionais maiores que zero.
                  </p>
                  {activeStiffnessComponents(p.mode).map((key) => (
                    <NumberField
                      key={key}
                      label={`Fator ${stiffnessLabels[key]}`}
                      value={member.stiffness?.[key] ?? 1}
                      validate={(value) =>
                        memberStiffnessError(p.mode, geometry, material, {
                          ...member.stiffness,
                          [key]: value,
                        })
                      }
                      onChange={(value) =>
                        edit((draft) =>
                          setStiffnessFactor(
                            draft.members.find(({ id }) => id === member.id)!,
                            key,
                            value,
                          ),
                        )
                      }
                    />
                  ))}
                  <table aria-label="Rigidez bruta e efetiva da barra">
                    <thead>
                      <tr>
                        <th scope="col">Rigidez</th>
                        <th scope="col">Bruta</th>
                        <th scope="col">Efetiva</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeStiffnessComponents(p.mode).map((key) => {
                        const unit =
                          key === "ea" ? units.force : `${units.force}·m²`;
                        const value = (rigidity: number) =>
                          stiffnessNumber.format(
                            fromSI(rigidity, "force", units),
                          );
                        return (
                          <tr key={key}>
                            <th scope="row">
                              {stiffnessLabels[key]} <small>{unit}</small>
                            </th>
                            <td>{value(gross[key])}</td>
                            <td>
                              {value(
                                gross[key] * (member.stiffness?.[key] ?? 1),
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </details>
              )}
              <button onClick={() => onSections(section.id)}>
                Catálogo de seções
              </button>
              <h4>Material da seção</h4>
              <div className="property-line">
                <span>{section.name}</span>
                <b>{material.name}</b>
              </div>
              <MaterialProperties material={material} />
              <button onClick={onMaterials}>
                Abrir material na biblioteca
              </button>
            </>
          )}
        {!slab && (member || node || !p.slabs.length) && (
          <div className="scope-note">
            <b>Estática linear · {spatial ? "Espacial" : "Plano XZ"}</b>
            <p>
              Barras de Euler–Bernoulli. Configure o peso próprio nos padrões de
              carga.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
