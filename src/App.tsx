import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  Box,
  Boxes,
  ChevronDown,
  CircleDot,
  FilePlus2,
  FolderOpen,
  Save,
  Undo2,
  Redo2,
  MousePointer2,
  MoveUpRight,
  Trash2,
  Play,
  Settings2,
  ShieldCheck,
  Download,
  Layers3,
  BookOpen,
  GitBranch,
  History,
  Square,
  PanelLeft,
  PanelRight,
  Columns2,
} from "lucide-react";
import {
  addPoint,
  beamExample,
  createProject,
  projectSchema,
  referenceErrors,
  parseProject,
  removeSelection,
  serializeProject,
  uid,
  type Project,
  type SelectedObject,
  type Selection,
} from "./domain/model";
import { addMember, connectIntersections, replicate } from "./domain/editing";
import {
  onPlane,
  origin,
  planeCoordinates,
  type PlaneKind,
  type Point3,
  type WorkPlane,
} from "./domain/geometry";
import { historyReducer } from "./domain/history";
import WorkPlaneView, {
  additiveSelection,
  type Display,
  type Tool,
} from "./components/WorkPlaneView";
import {
  GuideEditor,
  ReplicateDialog,
  WorkPlaneControls,
} from "./components/LaunchTools";
import SpatialView from "./components/SpatialView";
import Inspector from "./components/Inspector";
import Results from "./components/Results";
import SolverSettings from "./components/SolverSettings";
import RunHistory from "./components/RunHistory";
import { version } from "../package.json";
import {
  exportOofem,
  parseOofemOutput,
  type AnalysisResult,
} from "./solver/oofem";
import {
  analyze,
  cancelAnalysis,
  desktop,
  exportFile,
  openProject,
  saveProject,
  type RunLog,
} from "./solver/desktop";

const initial = () => {
  try {
    const cached =
      localStorage.getItem("kstruct.draft.v2") ??
      localStorage.getItem("kstruct.draft.v1");
    if (cached) return parseProject(cached);
  } catch {
    /* Corrupted drafts never prevent opening the editor. */
  }
  return createProject();
};
export default function App() {
  const [history, dispatch] = useReducer(historyReducer, undefined, () => ({
    past: [],
    current: initial(),
    future: [],
  }));
  const p = history.current;
  const spatial = p.mode === "spatial";
  const [selection, setSelection] = useState<SelectedObject[]>([]),
    [tool, setTool] = useState<Tool>("select");
  const [preferredPlane, setPlane] = useState<PlaneKind>("XY");
  const [guideId, setGuide] = useState("");
  const [orthogonal, setOrthogonal] = useState(true);
  const [launchDialog, setLaunchDialog] = useState<
    "guides" | "replicate" | null
  >(null);
  const kind = spatial ? preferredPlane : "XZ";
  const planeGuides = p.guides[planeCoordinates[kind][2]];
  const activeGuide =
    planeGuides.find((g) => g.id === guideId) ?? planeGuides[0];
  const plane: WorkPlane = { kind, offset: spatial ? activeGuide.position : 0 };
  const [pending, setPending] = useState<Point3 | null>(null),
    [display, setDisplay] = useState<Display>("model");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [activeRun, setActiveRun] = useState<{
    id: string;
    ready: boolean;
    cancelling: boolean;
  } | null>(null);
  const activeRunId = useRef<string | null>(null);
  const running = activeRun !== null;
  const [lastLog, setLastLog] = useState<RunLog | null>(null);
  const [showRunHistory, setShowRunHistory] = useState(false);
  const [message, setMessage] = useState(
    "Pronto para modelar. Selecione Barra (B) e marque duas extremidades no plano de trabalho.",
  );
  const [saved, setSaved] = useState(serializeProject(p));
  const [tab, setTab] = useState("Modelo"),
    [settings, setSettings] = useState(false),
    [left, setLeft] = useState(true),
    [right, setRight] = useState(true),
    [dual, setDual] = useState(true);
  const [executable, setExecutable] = useState(() => {
    try {
      return localStorage.getItem("kstruct.oofem.path") ?? "";
    } catch {
      return "";
    }
  });
  const [caseId, setCaseId] = useState(p.analysisCases[0].id),
    [patternId, setPatternId] = useState(p.loadPatterns[0].id);
  const [confirmation, setConfirmation] = useState<{
    label: string;
    action: () => void;
  } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null),
    current = useRef(p);
  current.current = p;
  const serialized = serializeProject(p),
    dirty = serialized !== saved;
  useEffect(() => {
    setResult(null);
    setDisplay("model");
    try {
      localStorage.setItem("kstruct.draft.v2", serialized);
    } catch {
      setMessage(
        "Não foi possível guardar o rascunho automático. Salve o projeto em arquivo.",
      );
    }
  }, [serialized]);
  useEffect(() => {
    const fn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, [dirty]);
  const edit = useCallback((fn: (p: Project) => void) => {
    try {
      const next = structuredClone(current.current);
      fn(next);
      if (!projectSchema.safeParse(next).success)
        throw new Error(
          "A alteração contém valores inválidos ou excede os limites do projeto.",
        );
      const errors = referenceErrors(next);
      if (errors.length) throw new Error(errors.join("\n"));
      if (serializeProject(next) !== serializeProject(current.current)) {
        current.current = next;
        dispatch({ type: "change", project: next });
        setResult(null);
        setDisplay("model");
      }
      return null;
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      setMessage(error);
      return error;
    }
  }, []);
  const isSelected = (kind: SelectedObject["kind"], id: string) =>
    selection.some((s) => s.kind === kind && s.id === id);
  const selectObject = (object: Selection, additive = false) => {
    if (!additive) setSelection(object ? [object] : []);
    else if (object)
      setSelection((selected) => {
        const same = (s: SelectedObject) =>
          s.kind === object.kind && s.id === object.id;
        return selected.some(same)
          ? selected.filter((s) => !same(s))
          : [...selected, object];
      });
  };
  const changeTool = (t: Tool) => {
    setTool(t);
    setPending(null);
    setDisplay("model");
  };
  const replace = (project: Project) => {
    setResult(null);
    current.current = project;
    dispatch({ type: "reset", project });
    setSelection([]);
    setPending(null);
    setPlane("XY");
    setGuide("");
    setCaseId(project.analysisCases[0].id);
    setPatternId(project.loadPatterns[0].id);
    setSaved(serializeProject(project));
    setMessage(`Projeto aberto: ${project.name}.`);
    changeTool("select");
  };
  const protect = (label: string, action: () => void) => {
    if (dirty) setConfirmation({ label, action });
    else action();
  };
  const save = async () => {
    try {
      const project = current.current;
      const snapshot = serializeProject(project);
      if (await saveProject(project)) {
        setSaved(snapshot);
        setMessage("Projeto salvo.");
      }
    } catch (e) {
      setMessage(String(e));
    }
  };
  const open = async () => {
    try {
      if (desktop()) {
        const loaded = await openProject();
        if (loaded) replace(loaded);
      } else fileInput.current?.click();
    } catch (e) {
      setMessage(String(e));
    }
  };
  const remove = () => {
    if (edit((p) => removeSelection(p, selection))) return;
    setSelection([]);
    setPending(null);
  };
  const undo = () => {
    setResult(null);
    setDisplay("model");
    dispatch({ type: "undo" });
    setSelection([]);
    setPending(null);
  };
  const redo = () => {
    setResult(null);
    setDisplay("model");
    dispatch({ type: "redo" });
    setSelection([]);
    setPending(null);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (launchDialog) {
        if (e.key === "Escape") setLaunchDialog(null);
        return;
      }
      if (settings || confirmation || showRunHistory) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        (e.target as HTMLElement).blur();
        setTimeout(() => void save(), 0);
        return;
      }
      if ((e.target as HTMLElement).closest("input,textarea,select,button"))
        return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (e.key === "Escape") {
        changeTool("select");
        setSelection([]);
      }
      if (!e.ctrlKey && !e.metaKey) {
        if (e.key.toLowerCase() === "b") changeTool("member");
        if (e.key.toLowerCase() === "n") changeTool("node");
        if (e.key.toLowerCase() === "v") changeTool("select");
        if (e.key === "Delete") remove();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  const onPoint = (point: Point3) => {
    if (tool === "node") {
      let id = "";
      const error = edit((p) => {
        id = addPoint(p, point).id;
      });
      if (!error) selectObject({ kind: "node", id });
      return;
    }
    if (tool !== "member") return;
    if (!pending) {
      setPending(point);
      return;
    }
    let id = "";
    const error = edit((p) => {
      id = addMember(p, pending, point).id;
    });
    if (!error) {
      selectObject({ kind: "member", id });
      setPending(null);
    }
  };
  const selectPlane = () => {
    const ids = new Set(
      p.nodes.filter((n) => onPlane(n, plane)).map((n) => n.id),
    );
    changeTool("select");
    setSelection([
      ...Array.from(ids, (id) => ({ kind: "node" as const, id })),
      ...p.members
        .filter((m) => ids.has(m.start) && ids.has(m.end))
        .map((m) => ({ kind: "member" as const, id: m.id })),
    ]);
  };
  const connect = () => {
    let report: ReturnType<typeof connectIntersections> | undefined;
    const error = edit((p) => {
      report = connectIntersections(p);
    });
    if (error || !report) return;
    changeTool("select");
    if (report.divided) setSelection([]);
    setMessage(
      report.divided
        ? `${report.divided} barras subdivididas · ${report.joints} novos nós.`
        : "Nenhuma interseção ou nó interno pendente de conexão.",
    );
  };
  const replicateSelection = (offset: Point3, copies: number) => {
    let created: SelectedObject[] = [];
    const error = edit((p) => {
      created = replicate(p, selection, offset, copies);
    });
    if (!error) {
      changeTool("select");
      setSelection(created);
      setMessage(
        `${copies} cópia(s) criada(s) · ${created.length} objetos selecionados.`,
      );
    }
    return error;
  };
  const run = async () => {
    if (activeRunId.current) return;
    const id = uid();
    activeRunId.current = id;
    setActiveRun({ id, ready: false, cancelling: false });
    setResult(null);
    setDisplay("model");
    const snapshot = serializeProject(p),
      requestedCase = caseId;
    try {
      const { execution, input } = await analyze(
        p,
        caseId,
        executable,
        id,
        () => {
          setActiveRun((active) =>
            active?.id === id ? { ...active, ready: true } : active,
          );
        },
      );
      setLastLog(execution.log);
      const historyNotice = execution.historyError
        ? `\n${execution.historyError}`
        : "";
      if (
        execution.log.summary.status !== "completed" ||
        execution.output === null
      ) {
        setMessage(`${execution.log.summary.message}${historyNotice}`);
        return;
      }
      if (serializeProject(current.current) !== snapshot) {
        setMessage(
          `O modelo mudou durante a análise. Execute novamente para obter resultados atuais.${historyNotice}`,
        );
        return;
      }
      setResult(parseOofemOutput(execution.output, input));
      setDisplay(spatial ? "deformed" : "m");
      setMessage(
        `Análise concluída · ${requestedCase}\nEquilíbrio global verificado. Consulte reações, deslocamentos e esforços.${historyNotice}`,
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      activeRunId.current = null;
      setActiveRun(null);
    }
  };
  const cancel = async () => {
    if (!activeRun?.ready || activeRun.cancelling) return;
    const { id } = activeRun;
    setActiveRun({ ...activeRun, cancelling: true });
    try {
      if (await cancelAnalysis(id)) return;
    } catch (e) {
      if (activeRunId.current === id) setMessage(String(e));
    }
    setActiveRun((active) =>
      active?.id === id ? { ...active, cancelling: false } : active,
    );
  };
  const exportDeck = async () => {
    try {
      if (await exportFile("analysis.in", exportOofem(p, caseId).deck))
        setMessage("Entrada OOFEM exportada em unidades SI (N, m, kg, s).");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <img src="/icon.svg" alt="" />
          <span>
            KStruct<small>OPENSTRUCT</small>
          </span>
        </div>
        <div className="quick-actions">
          <button
            title="Novo projeto"
            aria-label="Novo projeto"
            onClick={() =>
              protect("Criar um novo projeto", () => replace(createProject()))
            }
          >
            <FilePlus2 size={17} />
          </button>
          <button
            title="Novo pórtico espacial"
            aria-label="Novo pórtico espacial"
            onClick={() =>
              protect("Criar um pórtico espacial", () =>
                replace(createProject("spatial")),
              )
            }
          >
            <Boxes size={17} />
          </button>
          <button
            title="Abrir projeto"
            aria-label="Abrir projeto"
            onClick={() => protect("Abrir outro projeto", () => void open())}
          >
            <FolderOpen size={17} />
          </button>
          <button
            title="Salvar projeto (Ctrl+S)"
            aria-label="Salvar projeto"
            onClick={() => void save()}
          >
            <Save size={17} />
          </button>
          <span className="separator" />
          <button
            title="Desfazer (Ctrl+Z)"
            aria-label="Desfazer"
            disabled={!history.past.length}
            onClick={undo}
          >
            <Undo2 size={17} />
          </button>
          <button
            title="Refazer (Ctrl+Shift+Z)"
            aria-label="Refazer"
            disabled={!history.future.length}
            onClick={redo}
          >
            <Redo2 size={17} />
          </button>
        </div>
        <div className="project-title">
          <input
            aria-label="Nome do projeto"
            value={p.name}
            maxLength={120}
            onChange={(e) => {
              if (e.target.value.trim())
                edit((p) => {
                  p.name = e.target.value;
                });
            }}
          />
          <span>{dirty ? "Modificado" : "Rascunho local"}</span>
        </div>
        <div className="version">
          {version} <span>ALPHA</span>
        </div>
        <button
          title="Configurar OOFEM"
          aria-label="Configurar OOFEM"
          onClick={() => setSettings(true)}
        >
          <Settings2 size={18} />
        </button>
      </header>
      <nav className="ribbon-tabs">
        {["Modelo", "Análise", "Exibição"].map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
        <span className="ribbon-caption">
          Análise estrutural por elementos finitos
        </span>
      </nav>
      <div className="ribbon">
        {tab === "Modelo" && (
          <>
            <div className="ribbon-group">
              <div className="ribbon-tools">
                {(
                  [
                    ["select", "Selecionar", MousePointer2, "V"],
                    ["node", "Nó", CircleDot, "N"],
                    ["member", "Barra", MoveUpRight, "B"],
                  ] as const
                ).map(([key, label, Icon, shortcut]) => (
                  <button
                    key={key}
                    className={`tool-button ${tool === key ? "active" : ""}`}
                    onClick={() => changeTool(key)}
                    title={`${label} (${shortcut})`}
                  >
                    <Icon size={21} />
                    <span>{label}</span>
                    <kbd>{shortcut}</kbd>
                  </button>
                ))}
                <button
                  className="tool-button"
                  disabled={!selection.length}
                  onClick={remove}
                >
                  <Trash2 size={19} />
                  <span>Excluir</span>
                </button>
              </div>
              <small>LANÇAMENTO</small>
            </div>
            <div className="ribbon-group loads-group">
              <label>
                Padrão de cargas
                <select
                  aria-label="Padrão de cargas"
                  value={patternId}
                  onChange={(e) => setPatternId(e.target.value)}
                >
                  {p.loadPatterns.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
              <small>ATRIBUIÇÕES NO PAINEL DE PROPRIEDADES</small>
            </div>
            <div className="ribbon-group">
              <button
                className="example-button"
                onClick={() =>
                  protect("Abrir a viga de referência", () =>
                    replace(beamExample()),
                  )
                }
              >
                <BookOpen size={18} />
                <span>
                  Viga de referência<small>6 m · 10 kN/m</small>
                </span>
              </button>
              <small>MODELO DE VALIDAÇÃO</small>
            </div>
          </>
        )}
        {tab === "Análise" && (
          <>
            <div className="ribbon-group">
              <button className="tool-button" onClick={exportDeck}>
                <Download size={21} />
                <span>Entrada OOFEM</span>
              </button>
              <small>EXPORTAR MODELO</small>
            </div>
            <div className="ribbon-group">
              <button className="tool-button" onClick={() => setSettings(true)}>
                <Settings2 size={21} />
                <span>Configurar motor</span>
              </button>
              <small>SOLVER NATIVO</small>
            </div>
            {desktop() && (
              <div className="ribbon-group">
                <button
                  className="tool-button"
                  aria-label="Histórico de análises"
                  onClick={() => setShowRunHistory(true)}
                >
                  <History size={21} />
                  <span>Histórico</span>
                </button>
              </div>
            )}
            <div className="analysis-description">
              <b>
                {spatial
                  ? "Estática linear espacial"
                  : "Estática linear no plano XZ"}
              </b>
              <span>
                Euler–Bernoulli · {p.mesh.segmentsPerMember} elementos por barra
              </span>
              <span>
                Peso próprio aplicado manualmente como carga distribuída
              </span>
            </div>
          </>
        )}
        {tab === "Exibição" && (
          <div className="ribbon-group">
            <div className="ribbon-tools">
              <button
                className={`tool-button ${left ? "active" : ""}`}
                onClick={() => setLeft((v) => !v)}
              >
                <PanelLeft />
                <span>Explorador</span>
              </button>
              <button
                className={`tool-button ${right ? "active" : ""}`}
                onClick={() => setRight((v) => !v)}
              >
                <PanelRight />
                <span>Propriedades</span>
              </button>
              <button
                className={`tool-button ${dual ? "active" : ""}`}
                onClick={() => setDual((v) => !v)}
              >
                <Columns2 />
                <span>Duas vistas</span>
              </button>
            </div>
            <small>ÁREA DE TRABALHO</small>
          </div>
        )}
        <div className="run-group">
          <label>
            Caso de análise
            <select
              aria-label="Caso de análise"
              disabled={running}
              value={caseId}
              onChange={(e) => {
                setCaseId(e.target.value);
                setResult(null);
                setDisplay("model");
              }}
            >
              {p.analysisCases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="run-button"
            disabled={running}
            onClick={() => void run()}
          >
            <Play size={15} fill="currentColor" />
            {running ? "Analisando…" : "Analisar"}
          </button>
          {activeRun?.ready && (
            <button
              className="cancel-analysis"
              aria-label="Cancelar análise"
              title="Cancelar análise"
              disabled={activeRun.cancelling}
              onClick={() => void cancel()}
            >
              <Square size={14} />
              {activeRun.cancelling ? "Cancelando…" : "Cancelar"}
            </button>
          )}
        </div>
      </div>
      <div className="workspace">
        {left && (
          <aside className="explorer">
            <div className="panel-title">
              <Layers3 size={15} />
              Explorador do modelo
            </div>
            <div className="tree-scroll">
              <div className="tree-root">
                <ChevronDown size={14} />
                <Box size={15} />
                Estrutura
              </div>
              <details open>
                <summary>
                  Nós <span>{p.nodes.length}</span>
                </summary>
                {p.nodes.map((n) => (
                  <button
                    className={isSelected("node", n.id) ? "selected" : ""}
                    aria-pressed={isSelected("node", n.id)}
                    key={n.id}
                    onClick={(e) =>
                      selectObject(
                        { kind: "node", id: n.id },
                        additiveSelection(e),
                      )
                    }
                  >
                    <CircleDot size={12} />
                    {n.name}
                    <small>
                      {Object.values(n.restraints).some(Boolean) ? "Apoio" : ""}
                    </small>
                  </button>
                ))}
                {!p.nodes.length && (
                  <p className="tree-empty">Nenhum nó lançado</p>
                )}
              </details>
              <details open>
                <summary>
                  Barras <span>{p.members.length}</span>
                </summary>
                {p.members.map((m) => (
                  <button
                    className={isSelected("member", m.id) ? "selected" : ""}
                    aria-pressed={isSelected("member", m.id)}
                    key={m.id}
                    onClick={(e) =>
                      selectObject(
                        { kind: "member", id: m.id },
                        additiveSelection(e),
                      )
                    }
                  >
                    <MoveUpRight size={13} />
                    {m.name}
                  </button>
                ))}
              </details>
              <details>
                <summary>
                  Seções <span>{p.sections.length}</span>
                </summary>
                {p.sections.map((s) => (
                  <p key={s.id} className="tree-empty">
                    {(s.width * 100).toFixed(1)} × {(s.height * 100).toFixed(1)}{" "}
                    cm
                  </p>
                ))}
              </details>
              <details>
                <summary>
                  Casos de análise <span>{p.analysisCases.length}</span>
                </summary>
                {p.analysisCases.map((c) => (
                  <p className="tree-empty" key={c.id}>
                    {c.name}
                  </p>
                ))}
              </details>
            </div>
            <div className="identity-card">
              <img
                src="/assets/dedalo.webp"
                alt="Dédalo apoiado em uma coluna grega, identidade do KStruct"
              />
              <div>
                <b>A arte de estruturar.</b>
                <span>KStruct / OpenStruct</span>
              </div>
            </div>
            <a
              className="repo-link"
              href="https://github.com/ricardocorsini/k-struct"
              target="_blank"
              rel="noreferrer"
            >
              <GitBranch size={13} />
              Projeto open source ↗
            </a>
          </aside>
        )}
        <main className="work-area">
          <div className="model-bar">
            <div>
              <span className="status-dot" />
              {spatial ? "Modelo espacial" : "Modelo estrutural"}{" "}
              <span className="model-count">
                {p.nodes.length} nós · {p.members.length} barras
              </span>
            </div>
            <select
              aria-label="Visualização dos resultados"
              value={display}
              onChange={(e) => setDisplay(e.target.value as Display)}
            >
              <option value="model">Geometria e cargas</option>
              {result && (
                <>
                  <option value="deformed">Deformada ampliada</option>
                  {spatial ? (
                    <>
                      <option value="my">Momento fletor My</option>
                      <option value="mz">Momento fletor Mz</option>
                      <option value="mx">Torção Mx</option>
                      <option value="vy">Cortante Vy</option>
                      <option value="vz">Cortante Vz</option>
                    </>
                  ) : (
                    <>
                      <option value="m">Momento fletor M</option>
                      <option value="v">Cortante V</option>
                    </>
                  )}
                  <option value="n">Normal N</option>
                </>
              )}
            </select>
          </div>
          {spatial && (
            <WorkPlaneControls
              kind={plane.kind}
              guideId={activeGuide.id}
              guides={planeGuides}
              orthogonal={orthogonal}
              selected={selection.length}
              onPlane={(kind) => {
                setPlane(kind);
                setGuide("");
              }}
              onGuide={setGuide}
              toggleOrtho={() => setOrthogonal((v) => !v)}
              editGuides={() => setLaunchDialog("guides")}
              selectPlane={selectPlane}
              replicate={() => setLaunchDialog("replicate")}
              connect={connect}
            />
          )}
          <div className={`viewports ${dual ? "dual" : "single"}`}>
            <WorkPlaneView
              project={p}
              plane={plane}
              orthogonal={orthogonal}
              selection={selection}
              tool={tool}
              result={result}
              display={display}
              patternId={patternId}
              pending={pending}
              onPoint={onPoint}
              onSelect={selectObject}
            />
            {dual && (
              <SpatialView
                project={p}
                selection={selection}
                result={display === "deformed" ? result : null}
                onSelect={selectObject}
              />
            )}
          </div>
          {display !== "model" && result && (
            <div className="diagram-caption">
              {display === "deformed"
                ? "Deformada ampliada automaticamente. Valores reais na tabela de deslocamentos."
                : spatial
                  ? "Esforços nos eixos locais, na face positiva de x. N positivo em tração. O diagrama é desenhado no plano ativo."
                  : "Esforços amostrados nos nós da malha. N positivo em tração. M positivo sagente para barras horizontais orientadas +X."}
            </div>
          )}
          <Results
            project={p}
            result={result}
            message={message}
            running={running}
            cancelling={activeRun?.cancelling ?? false}
            openRunHistory={lastLog ? () => setShowRunHistory(true) : undefined}
          />
        </main>
        {right && (
          <Inspector
            project={p}
            selection={selection}
            patternId={patternId}
            edit={edit}
          />
        )}
      </div>
      <footer className="status-bar">
        <span>
          <ShieldCheck size={13} />
          {result
            ? "Análise concluída"
            : running
              ? "Análise em andamento"
              : "Modelo em edição"}
        </span>
        <span>
          {pending
            ? "Marque a segunda extremidade · Esc para cancelar"
            : tool === "member"
              ? "Marque a primeira extremidade da barra"
              : tool === "node"
                ? "Clique na malha para inserir um nó"
                : selection.length > 1
                  ? `${selection.length} objetos selecionados`
                  : "Selecione um objeto · Ctrl ou Shift para seleção múltipla"}
        </span>
        <span>
          kN · m · rad <i /> {desktop() ? "Desktop" : "Navegador · edição"}{" "}
          <i /> OpenStruct
        </span>
      </footer>
      <input
        ref={fileInput}
        type="file"
        accept=".json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) {
            try {
              if (f.size > 5_000_000)
                throw new Error("Arquivo maior que 5 MB.");
              replace(parseProject(await f.text()));
            } catch (e) {
              setMessage(String(e));
            }
          }
          e.target.value = "";
        }}
      />
      {settings && (
        <SolverSettings
          executable={executable}
          running={running}
          onClose={() => setSettings(false)}
          onSave={(path) => {
            setExecutable(path);
            try {
              localStorage.setItem("kstruct.oofem.path", path);
            } catch {
              /* Keep the session preference. */
            }
            setSettings(false);
          }}
        />
      )}
      {showRunHistory && (
        <RunHistory latest={lastLog} onClose={() => setShowRunHistory(false)} />
      )}
      {launchDialog === "guides" && (
        <GuideEditor
          guides={p.guides}
          onClose={() => setLaunchDialog(null)}
          onApply={(guides) =>
            edit((p) => {
              p.guides = guides;
            })
          }
        />
      )}
      {launchDialog === "replicate" && (
        <ReplicateDialog
          count={selection.length}
          initial={{
            ...origin,
            z:
              plane.kind === "XY"
                ? ([...p.guides.z]
                    .sort((a, b) => a.position - b.position)
                    .find((g) => g.position > plane.offset)?.position ??
                    plane.offset) - plane.offset
                : 0,
          }}
          onApply={replicateSelection}
          onClose={() => setLaunchDialog(null)}
        />
      )}
      {confirmation && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
          >
            <h2 id="confirm-title">{confirmation.label}</h2>
            <p>
              Há alterações ainda não salvas em arquivo. Salve o projeto antes
              de continuar se desejar preservá-las.
            </p>
            <div className="modal-actions">
              <button onClick={() => setConfirmation(null)}>Voltar</button>
              <button
                className="primary"
                onClick={() => {
                  confirmation.action();
                  setConfirmation(null);
                }}
              >
                Continuar
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
