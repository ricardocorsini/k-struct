import { useEffect, useRef, useState } from "react";
import { Box, CircleDot, MoveRight, SlidersHorizontal } from "lucide-react";
import { coordinates, distance } from "../domain/geometry";
import {
  free,
  nodalLoad,
  uniformLoad,
  type NodalLoad,
  type UniformLoad,
  type Project,
  type SelectedObject,
} from "../domain/model";

export function NumberField({
  label,
  value,
  unit,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  unit?: string;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  const [draft, setDraft] = useState(String(value)),
    [invalid, setInvalid] = useState(false);
  const cancelling = useRef(false);
  useEffect(() => {
    setDraft(String(Number(value.toPrecision(10))));
    setInvalid(false);
  }, [value]);
  const commit = () => {
    if (cancelling.current) {
      cancelling.current = false;
      return;
    }
    const n = Number(draft.trim().replace(",", "."));
    if (
      !draft.trim() ||
      !Number.isFinite(n) ||
      (min !== undefined && n < min) ||
      (max !== undefined && n > max)
    ) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onChange(n);
  };
  return (
    <label className="number-field">
      <span>{label}</span>
      <div>
        <input
          aria-label={label}
          aria-invalid={invalid}
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              cancelling.current = true;
              setDraft(String(value));
              setInvalid(false);
              e.currentTarget.blur();
            }
          }}
        />
        {unit && <small>{unit}</small>}
      </div>
      {invalid && (
        <em>
          Informe um valor válido{min !== undefined ? ` (mín. ${min})` : ""}.
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

export default function Inspector({
  project: p,
  selection,
  patternId,
  edit,
}: {
  project: Project;
  selection: SelectedObject[];
  patternId: string;
  edit: (fn: (p: Project) => void) => void;
}) {
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
  const section = p.sections.find(
    (s) => s.id === (member?.sectionId ?? p.sections[0].id),
  )!;
  const material = p.materials.find((m) => m.id === section.materialId)!;
  const pattern = p.loadPatterns.find((l) => l.id === patternId)!;
  const nl = sumNodal(pattern, node?.id ?? "");
  const ul = sumUniform(pattern, member?.id ?? "");
  const nodeLoad = (key: Exclude<keyof NodalLoad, "nodeId">, value: number) =>
    edit((p) => {
      const pat = p.loadPatterns.find((l) => l.id === patternId)!;
      const next = sumNodal(pat, node!.id);
      if (next[key] / 1000 === value) return;
      next[key] = value * 1000;
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
      if (next[key] / 1000 === value) return;
      next[key] = value * 1000;
      pat.uniform = pat.uniform.filter((l) => l.memberId !== member!.id);
      if (uniformComponents.some((k) => next[k])) pat.uniform.push(next);
    });
  const selectedNodes = new Set(
    selection.filter((s) => s.kind === "node").map((s) => s.id),
  );
  const applyRestraints = (fixed: boolean) =>
    edit((p) => {
      for (const n of p.nodes) {
        if (!selectedNodes.has(n.id)) continue;
        n.restraints = free();
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
            {node ? <CircleDot /> : member ? <MoveRight /> : <Box />}
          </div>
          <div>
            <small>
              {node ? "NÓ ESTRUTURAL" : member ? "BARRA ESTRUTURAL" : "MODELO"}
            </small>
            <h3>
              {node?.name ??
                member?.name ??
                (selection.length > 1
                  ? "Seleção múltipla"
                  : "Definições iniciais")}
            </h3>
          </div>
        </div>
        {selection.length > 1 && (
          <>
            <p className="help">
              {selectedNodes.size} nós · {selection.length - selectedNodes.size}{" "}
              barras
            </p>
            {selectedNodes.size > 0 && supportPresets}
          </>
        )}
        {!selection.length && (
          <p className="help">
            Selecione um nó ou uma barra em qualquer vista para editar suas
            propriedades.
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
                unit="m"
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
                <b>0,00 m</b>
              </div>
            )}
            <h4>Apoios e restrições</h4>
            <p className="help">Marque os graus de liberdade impedidos.</p>
            <div className="restraints">
              {dofs.map((k) => (
                <label key={k}>
                  <input
                    type="checkbox"
                    aria-label={`Restringir ${k}`}
                    checked={node.restraints[k]}
                    onChange={(e) =>
                      edit((p) => {
                        p.nodes.find((n) => n.id === node.id)!.restraints[k] =
                          e.target.checked;
                      })
                    }
                  />
                  <span>
                    {`${k[0] === "r" ? "Rotação" : "Translação"} ${k[1].toUpperCase()}`}
                  </span>
                </label>
              ))}
            </div>
            {supportPresets}
            <h4>
              Carga nodal <span>{pattern.name}</span>
            </h4>
            {(spatial ? nodalComponents : (["fx", "fz", "my"] as const)).map(
              (k) => (
                <NumberField
                  key={`${patternId}-${k}`}
                  label={`${k[0] === "f" ? "Força" : "Momento"} ${k[1].toUpperCase()}`}
                  value={nl[k] / 1000}
                  unit={k[0] === "f" ? "kN" : "kN·m"}
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
            <h4>Conectividade</h4>
            <div className="property-line">
              <span>Início → fim</span>
              <b>
                {p.nodes.find((n) => n.id === member.start)?.name} →{" "}
                {p.nodes.find((n) => n.id === member.end)?.name}
              </b>
            </div>
            <div className="property-line">
              <span>Comprimento</span>
              <b>
                {(() => {
                  const a = p.nodes.find((n) => n.id === member.start)!,
                    b = p.nodes.find((n) => n.id === member.end)!;
                  return distance(a, b).toFixed(3);
                })()}{" "}
                m
              </b>
            </div>
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
            {spatial && (
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
            )}
            <h4>
              Carga distribuída <span>{pattern.name}</span>
            </h4>
            {axes.map((k) => (
              <NumberField
                key={`${patternId}-${k}`}
                label={`q${k.toUpperCase()} global`}
                unit="kN/m"
                value={ul[`q${k}`] / 1000}
                onChange={(v) => setUniformLoad(`q${k}`, v)}
              />
            ))}
            <p className="help">
              Carga uniforme por metro de barra. Use qZ negativo para cargas
              verticais descendentes.
            </p>
          </>
        )}
        {!node && selection.length < 2 && (
          <>
            <h4>Seção retangular compartilhada</h4>
            <p className="help">
              Alterações se aplicam a todas as barras que usam esta seção.
            </p>
            <NumberField
              label="Largura b"
              unit="cm"
              value={section.width * 100}
              min={0.1}
              onChange={(v) =>
                edit((p) => {
                  p.sections.find((s) => s.id === section.id)!.width = v / 100;
                })
              }
            />
            <NumberField
              label="Altura h"
              unit="cm"
              value={section.height * 100}
              min={0.1}
              onChange={(v) =>
                edit((p) => {
                  p.sections.find((s) => s.id === section.id)!.height = v / 100;
                })
              }
            />
            <div className="section-preview">
              <div
                style={{
                  width: Math.max(
                    15,
                    Math.min(90, (section.width / section.height) * 70),
                  ),
                  height: 70,
                }}
              />
              <span>
                A = {(section.width * section.height * 1e4).toFixed(1)} cm²
                <br />
                IY ={" "}
                {(((section.width * section.height ** 3) / 12) * 1e8).toFixed(
                  1,
                )}{" "}
                cm⁴
              </span>
            </div>
            <h4>Material compartilhado</h4>
            <NumberField
              label="Módulo E"
              unit="GPa"
              value={material.E / 1e9}
              min={0.001}
              onChange={(v) =>
                edit((p) => {
                  p.materials.find((m) => m.id === material.id)!.E = v * 1e9;
                })
              }
            />
            <NumberField
              label="Poisson ν"
              value={material.nu}
              min={0}
              max={0.49}
              onChange={(v) =>
                edit((p) => {
                  p.materials.find((m) => m.id === material.id)!.nu = v;
                })
              }
            />
          </>
        )}
        <div className="scope-note">
          <b>Estática linear · {spatial ? "Espacial" : "Plano XZ"}</b>
          <p>
            Barras de Euler–Bernoulli, ligações rígidas e cargas globais. Peso
            próprio deve ser aplicado como carga.
          </p>
        </div>
      </div>
    </aside>
  );
}
