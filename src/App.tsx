import { SectionCutsDialog } from "./components/SectionCutsDialog";
import AreaComparison from "./components/AreaComparison";
import { comparisonModelKey } from "./solver/areaMaps";
import { LoadPanelDialog, newLoadPanel } from "./components/LoadPanelDialog";
import {
  SurfacePanelDialog,
  newSurfacePanel,
} from "./components/SurfacePanelDialog";
import { SurfacePanelResults } from "./components/SurfacePanelResults";
import type { SurfacePanel } from "./domain/model";
import { panelKinds } from "./domain/surfacePanel";
import { SlabJointDialog } from "./components/SlabJointDialog";
import { jointPanels, jointNames, refreshJoint } from "./domain/slabJoint";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  ArrowDownToLine,
  ChartNoAxesCombined,
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
  Library,
  GitBranch,
  History,
  ListChecks,
  Table2,
  Square,
  Pentagon,
  PanelLeft,
  PanelRight,
  Scissors,
  Ruler,
  ScanSearch,
  Waypoints,
} from "lucide-react";
import {
  addPoint,
  beamExample,
  createProject,
  projectSchema,
  projectFileLimit,
  referenceErrors,
  parseProject,
  removeSelection,
  serializeProject,
  uid,
  type Project,
  type LoadPanel,
  type ResultEnvelope,
  type SelectedObject,
  type Selection,
} from "./domain/model";
import {
  addMember,
  addSlab,
  addPolygonSlab,
  addSlabOpening,
  newSlabRing,
  inspectNodeCoordinateChanges,
} from "./domain/editing";
import {
  onPlane,
  dot,
  subtract,
  origin,
  planeCoordinates,
  type PlaneKind,
  type Point3,
  type WorkPlane,
} from "./domain/geometry";
import { maxSlabVertices, slabRings } from "./domain/slabPolygon";
import MemberPointLoadDialog from "./components/MemberPointLoadDialog";
import MemberDistributedLoadDialog from "./components/MemberDistributedLoadDialog";
import type { MemberLoadSelection } from "./components/memberLoadInput";
import { memberAxis } from "./domain/memberOffsets";
import { historyReducer } from "./domain/history";
import { hasElasticSupport, hasSupport } from "./domain/supports";
import { saveDiagnosticContext } from "./solver/diagnosticHistory";
import {
  diagnoseModel,
  diagnoseSolverFailure,
  type AnalysisDiagnostic,
} from "./domain/diagnostics";
import { applyTabularImport } from "./domain/tabularImport";
import { applyTheme, readTheme, saveTheme, type Theme } from "./theme";
import { UnitsDialog, useUnits } from "./components/Units";
import { formatQuantity } from "./units";
import WorkPlaneView, {
  additiveSelection,
  type Display,
  type Tool,
  type PlaneCamera,
} from "./components/WorkPlaneView";
import { GuideEditor, WorkPlaneControls } from "./components/LaunchTools";
import { parseNumberInput } from "./components/numberInput";
import NewProjectDialog from "./components/NewProjectDialog";
import SpatialView, { type SpatialCamera } from "./components/SpatialView";
import { useViewLayers } from "./components/ViewLayers";
import Inspector from "./components/Inspector";
import SelectionDialog from "./components/SelectionDialog";
import TransformDialog from "./components/TransformDialog";
import DuplicateDialog from "./components/DuplicateDialog";
import SectionCatalog from "./components/SectionCatalog";
import { dimensions, shapeNames } from "./domain/sections";
import MaterialLibrary from "./components/MaterialLibrary";
import DiaphragmDialog from "./components/DiaphragmDialog";
import MeshConnections from "./components/MeshConnections";
import MemberEditDialog from "./components/MemberEditDialog";
import type { MemberEdit } from "./domain/memberOperations";
import type { TransformPlan } from "./domain/transform";
import { combineSelection } from "./domain/selection";
import NodeTable from "./components/NodeTable";
import Results from "./components/Results";
import SlabResults, {
  SlabLegend,
  buildSlabMap,
  isSlabDisplay,
  slabDisplays,
  type SlabDisplay,
} from "./components/SlabResults";
import EnvelopeResults, {
  type EnvelopeView,
} from "./components/EnvelopeResults";
import SolverSettings from "./components/SolverSettings";
import RunHistory from "./components/RunHistory";
import LoadDefinitions, {
  type LoadDefinitionsPage,
} from "./components/LoadDefinitions";
import { version } from "../package.json";
import {
  prepareMemberDiagram,
  type SectionCursor,
} from "./solver/memberDiagram";
import { combineLinearResults, requiredCaseIds } from "./solver/combinations";
import {
  envelopeCombinations,
  evaluateEnvelope,
  type EnvelopeResult,
} from "./solver/envelopes";
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

type PlanePanel = "primary" | "elevation";
type Panel = PlanePanel | "perspective";
type Layout = "single" | "dual" | "planes" | "triple";
type PlaneChoice = { kind: PlaneKind; guideId: string };
const initialPlanes = (levelId = ""): Record<PlanePanel, PlaneChoice> => ({
  primary: { kind: "XY", guideId: levelId },
  elevation: { kind: "XZ", guideId: "" },
});

const initial = () => {
  try {
    const cached =
      localStorage.getItem("kstruct.draft.v32") ??
      localStorage.getItem("kstruct.draft.v31") ??
      localStorage.getItem("kstruct.draft.v30") ??
      localStorage.getItem("kstruct.draft.v29") ??
      localStorage.getItem("kstruct.draft.v28") ??
      localStorage.getItem("kstruct.draft.v27") ??
      localStorage.getItem("kstruct.draft.v26") ??
      localStorage.getItem("kstruct.draft.v25") ??
      localStorage.getItem("kstruct.draft.v24") ??
      localStorage.getItem("kstruct.draft.v23") ??
      localStorage.getItem("kstruct.draft.v22") ??
      localStorage.getItem("kstruct.draft.v21") ??
      localStorage.getItem("kstruct.draft.v20") ??
      localStorage.getItem("kstruct.draft.v19") ??
      localStorage.getItem("kstruct.draft.v18") ??
      localStorage.getItem("kstruct.draft.v17") ??
      localStorage.getItem("kstruct.draft.v16") ??
      localStorage.getItem("kstruct.draft.v15") ??
      localStorage.getItem("kstruct.draft.v14") ??
      localStorage.getItem("kstruct.draft.v13") ??
      localStorage.getItem("kstruct.draft.v12") ??
      localStorage.getItem("kstruct.draft.v11") ??
      localStorage.getItem("kstruct.draft.v10") ??
      localStorage.getItem("kstruct.draft.v9") ??
      localStorage.getItem("kstruct.draft.v8") ??
      localStorage.getItem("kstruct.draft.v7") ??
      localStorage.getItem("kstruct.draft.v6") ??
      localStorage.getItem("kstruct.draft.v5") ??
      localStorage.getItem("kstruct.draft.v4") ??
      localStorage.getItem("kstruct.draft.v3") ??
      localStorage.getItem("kstruct.draft.v2") ??
      localStorage.getItem("kstruct.draft.v1");
    if (cached) return parseProject(cached);
  } catch {
    /* Corrupted drafts never prevent opening the editor. */
  }
  return createProject();
};
function sameAnalysisModel(a: Project, b: Project) {
  return (
    !!(a.sectionCuts || b.sectionCuts) &&
    JSON.stringify({ ...a, sectionCuts: undefined }) ===
      JSON.stringify({ ...b, sectionCuts: undefined })
  );
}
export default function App() {
  const { units } = useUnits();
  const [showCuts, setShowCuts] = useState(false);
  const [showUnits, setShowUnits] = useState(false);
  const [history, dispatch] = useReducer(historyReducer, undefined, () => ({
    past: [],
    current: initial(),
    future: [],
  }));
  const p = history.current;
  const spatial = p.mode === "spatial";
  const [selection, setSelection] = useState<SelectedObject[]>([]),
    [tool, setTool] = useState<Tool>("select");
  const slab =
    p.slabs.find(
      (s) => s.id === selection.find((o) => o.kind === "slab")?.id,
    ) ?? p.slabs[0];
  const [loadPanelDraft, setLoadPanelDraft] = useState<LoadPanel | null>(null);
  const openLoadPanel = (id: string) =>
    setLoadPanelDraft(p.loadPanels?.find((v) => v.id === id) ?? null);
  const [panelDraft, setPanelDraft] = useState<SurfacePanel | null>(null);
  const hasPanels = !!p.surfacePanels?.length;
  const openPanel = (id: string) =>
    setPanelDraft(p.surfacePanels?.find((v) => v.id === id) ?? null);
  const [jointOpen, setJointOpen] = useState(false);
  const [layout, setLayout] = useState<Layout>("dual");
  const [showPanelAxes, setShowPanelAxes] = useState(true);
  const [showMemberAxes, setShowMemberAxes] = useState(false);
  const [activePanel, setActivePanel] = useState<Panel>("primary");
  const [planes, setPlanes] = useState(() => initialPlanes(slab?.levelId));
  const primaryLayers = useViewLayers();
  const elevationLayers = useViewLayers();
  const [perspectiveLayers, setPerspectiveLayers] = useViewLayers(false);
  const primaryCamera = useRef<PlaneCamera | null>(null);
  const elevationCamera = useRef<PlaneCamera | null>(null);
  const perspectiveCamera = useRef<SpatialCamera | null>(null);
  const splitPlanes = spatial && (layout === "triple" || layout === "planes");
  const perspective = layout === "dual" || layout === "triple";
  const planePanel = activePanel === "elevation" ? "elevation" : "primary";
  function viewPlane(panel: PlanePanel) {
    const choice = planes[panel];
    const kind = !spatial
      ? "XZ"
      : splitPlanes && panel === "primary"
        ? "XY"
        : choice.kind;
    const guides = p.guides[planeCoordinates[kind][2]];
    const guide = guides.find((g) => g.id === choice.guideId) ?? guides[0];
    return {
      plane: { kind, offset: spatial ? guide.position : 0 } satisfies WorkPlane,
      guides,
      guide,
    };
  }
  const [memberMode, setMemberMode] = useState<"single" | "chain" | "span">(
    "single",
  );
  const [launchSection, setLaunchSection] = useState("");
  const [rollText, setRollText] = useState("0");
  const sectionId =
    p.sections.find((s) => s.id === launchSection)?.id ?? p.sections[0].id;
  const roll = spatial ? parseNumberInput(rollText) : 0;
  const validRoll = Number.isFinite(roll) && Math.abs(roll) <= 360;
  const [orthogonal, setOrthogonal] = useState(true);
  const [launchDialog, setLaunchDialog] = useState<
    | "guides"
    | "replicate"
    | "diaphragms"
    | "mesh"
    | "materials"
    | "sections"
    | "member-edit"
    | "duplicates"
    | "nodes"
    | "new-project"
    | "selection"
    | null
  >(null);
  const [memberLoadDraft, setMemberLoadDraft] =
    useState<MemberLoadSelection | null>(null);
  const MemberLoadDialog =
    memberLoadDraft?.kind === "distributed"
      ? MemberDistributedLoadDialog
      : MemberPointLoadDialog;
  const choosingMemberLoad = tool === "pointLoad" || tool === "distributedLoad";
  const loadedMember =
    memberLoadDraft && p.members.find((m) => m.id === memberLoadDraft.memberId);
  const [catalogSectionId, setCatalogSectionId] = useState("");
  const openSections = (id: string) => {
    setCatalogSectionId(id);
    setLaunchDialog("sections");
  };
  const {
    plane,
    guides: planeGuides,
    guide: activeGuide,
  } = viewPlane(planePanel);
  const [outline, setOutline] = useState<Point3[]>([]);
  const [outlineError, setOutlineError] = useState("");
  const tracing = tool === "slabPolygon" || tool === "slabHole";
  const [pending, setPending] = useState<Point3 | null>(null),
    [display, setDisplay] = useState<Display | SlabDisplay>("model");
  const clearPlacement = () => {
    setPending(null);
    setOutline([]);
    setOutlineError("");
  };
  const [caseResults, setCaseResults] = useState<Map<string, AnalysisResult>>(
    () => new Map(),
  );
  const modelRevision = useRef(0);
  const [activeRun, setActiveRun] = useState<{
    id: string | null;
    ready: boolean;
    cancelling: boolean;
  } | null>(null);
  const runLock = useRef<{ stop: boolean } | null>(null);
  const [queue, setQueue] = useState<{
    revision: number;
    target: string;
    caseId?: string;
    failedId?: string;
    message: string;
  } | null>(null);
  const running = activeRun !== null;
  const [lastLog, setLastLog] = useState<RunLog | null>(null);
  const [analysisDiagnostics, setAnalysisDiagnostics] = useState<
    AnalysisDiagnostic[]
  >([]);
  const [diagnosticRevision, setDiagnosticRevision] = useState<number | null>(
    null,
  );
  const [showRunHistory, setShowRunHistory] = useState(false);
  const [message, setMessage] = useState(
    "Pronto para modelar. Selecione Barra (B) e marque duas extremidades no plano de trabalho.",
  );
  const [saved, setSaved] = useState(() => serializeProject(p));
  const [tab, setTab] = useState("Modelo"),
    [settings, setSettings] = useState(false),
    [left, setLeft] = useState(true),
    [right, setRight] = useState(true);
  const [theme, setTheme] = useState(readTheme);
  useLayoutEffect(() => applyTheme(theme), [theme]);
  const [executable, setExecutable] = useState(() => {
    try {
      return localStorage.getItem("kstruct.oofem.path") ?? "";
    } catch {
      return "";
    }
  });
  const [preferredCaseId, setCaseId] = useState(p.analysisCases[0].id),
    [preferredPatternId, setPatternId] = useState(p.loadPatterns[0].id);
  const [derivedChoice, setDerivedChoice] = useState<{
    kind: "combination" | "envelope";
    id: string;
  } | null>(null);
  const [envelopeView, setEnvelopeView] = useState<EnvelopeView>("members");
  const [resultTab, setResultTab] = useState("log");
  const [preferredSection, setPreferredSection] =
    useState<SectionCursor | null>(null);
  const [forceMemberId, setForceMemberId] = useState("");
  if (forceMemberId && !p.members.some(({ id }) => id === forceMemberId))
    setForceMemberId("");
  const [calculatedEnvelope, setCalculatedEnvelope] = useState<{
    project: Project;
    envelope: ResultEnvelope;
    cases: ReadonlyMap<string, AnalysisResult>;
    result: EnvelopeResult | null;
    problem: string;
  } | null>(null);
  const analysisCase =
    p.analysisCases.find((c) => c.id === preferredCaseId) ?? p.analysisCases[0];
  const caseId = analysisCase.id;
  const combination =
    !hasPanels && !slab && derivedChoice?.kind === "combination"
      ? p.resultCombinations.find(({ id }) => id === derivedChoice.id)
      : undefined;
  const envelope =
    !hasPanels && !slab && derivedChoice?.kind === "envelope"
      ? p.resultEnvelopes.find(({ id }) => id === derivedChoice.id)
      : undefined;
  const derived = combination ?? envelope;
  const patternId =
    p.loadPatterns.find((pattern) => pattern.id === preferredPatternId)?.id ??
    p.loadPatterns[0].id;
  const caseResult = caseResults.get(caseId) ?? null;
  const areaComparisonKey = useMemo(
    () => (hasPanels || p.slabs.length ? comparisonModelKey(p) : ""),
    [p, hasPanels],
  );
  const slabResult =
    caseResult?.floor?.panels.find((v) => v.slabId === slab?.id) ??
    caseResult?.slab ??
    null;
  const floorMaps = useMemo(() => {
    if (!caseResult?.floor || !isSlabDisplay(display)) return [];
    const maps = caseResult.floor.panels.map((panel) =>
      buildSlabMap(panel, display, units),
    );
    const scale = Math.max(...maps.map((m) => m.scale));
    return maps.map((m) => ({ ...m, scale }));
  }, [caseResult, display, units]);
  const slabMap = useMemo(
    () =>
      floorMaps.find((m) => m.result.slabId === slab?.id) ??
      (slabResult && isSlabDisplay(display)
        ? buildSlabMap(slabResult, display, units)
        : null),
    [floorMaps, slab?.id, slabResult, display, units],
  );
  const showSlabMap =
    plane.kind === "XY" && activeGuide.id === slab?.levelId ? slabMap : null;
  const requiredCases = useMemo(() => {
    const combinations = envelope
      ? envelopeCombinations(p, envelope)
      : combination
        ? [combination]
        : [];
    const ids = requiredCaseIds(combinations.flatMap(({ factors }) => factors));
    return p.analysisCases.filter(({ id }) => ids.has(id));
  }, [p, envelope, combination]);
  const missingCases = requiredCases.filter(
    ({ id }) => caseResults.get(id)?.caseId !== id,
  );
  const queueTarget = envelope
    ? `envelope:${envelope.id}`
    : `combination:${combination?.id}`;
  const queueView =
    queue?.revision === modelRevision.current && queue.target === queueTarget
      ? queue
      : null;
  const resultPatterns = useMemo(
    () =>
      new Set(
        (derived ? requiredCases : [analysisCase]).flatMap(({ factors }) =>
          factors
            .filter(({ factor }) => factor !== 0)
            .map(({ patternId }) => patternId),
        ),
      ),
    [derived, requiredCases, analysisCase],
  );
  const combined = useMemo(() => {
    if (!combination) return null;
    try {
      return {
        result: combineLinearResults(p, combination, caseResults),
        problem: "",
      };
    } catch (error) {
      return {
        result: null,
        problem: error instanceof Error ? error.message : String(error),
      };
    }
  }, [p, combination, caseResults]);
  useEffect(() => {
    if (!envelope) {
      setCalculatedEnvelope(null);
      return;
    }
    const controller = new AbortController();
    const context = { project: p, envelope, cases: caseResults };
    void evaluateEnvelope(p, envelope, caseResults, controller.signal).then(
      (result) => {
        if (!controller.signal.aborted)
          setCalculatedEnvelope({ ...context, result, problem: "" });
      },
      (error: unknown) => {
        if (!controller.signal.aborted)
          setCalculatedEnvelope({
            ...context,
            result: null,
            problem: error instanceof Error ? error.message : String(error),
          });
      },
    );
    return () => controller.abort();
  }, [p, envelope, caseResults]);
  const envelopeState =
    calculatedEnvelope?.project === p &&
    calculatedEnvelope.envelope === envelope &&
    calculatedEnvelope.cases === caseResults
      ? calculatedEnvelope
      : null;
  const envelopeResult = envelopeState?.result ?? null;
  const sectionMemberId =
    selection.find(
      (item) =>
        item.kind === "member" && p.members.some(({ id }) => item.id === id),
    )?.id ?? p.members[0]?.id;
  const beamDisplay = isSlabDisplay(display) ? "model" : display;
  const envelopeComponent =
    beamDisplay === "model" || beamDisplay === "deformed"
      ? spatial
        ? "my"
        : "m"
      : beamDisplay;
  const showEnvelope =
    Boolean(envelopeResult) && envelopeView === "members" && tool === "select";
  const result = envelope ? null : combined ? combined.result : caseResult;
  const visibleDisplay = showEnvelope
    ? envelopeComponent
    : result
      ? beamDisplay
      : "model";
  const diagram = useMemo(() => {
    if (!sectionMemberId || slab) return null;
    const sources =
      envelope && envelopeResult && envelopeView === "members"
        ? envelopeCombinations(p, envelope)
        : result && resultTab === "section"
          ? [
              combination ?? {
                id: analysisCase.id,
                name: analysisCase.name,
                factors: [{ caseId: analysisCase.id, factor: 1 }],
              },
            ]
          : null;
    return (
      sources && prepareMemberDiagram(p, sectionMemberId, sources, caseResults)
    );
  }, [
    sectionMemberId,
    slab,
    envelope,
    envelopeResult,
    envelopeView,
    p,
    result,
    resultTab,
    combination,
    analysisCase,
    caseResults,
  ]);
  const reading = useMemo(
    () =>
      diagram?.read(
        preferredSection?.memberId === diagram.memberId
          ? preferredSection
          : { t: 0 },
        envelopeComponent,
      ) ?? null,
    [diagram, preferredSection, envelopeComponent],
  );
  const sectionPlot = useMemo(
    () =>
      diagram && reading
        ? {
            memberId: diagram.memberId,
            t: reading.location.t,
            min: reading.min.forces[envelopeComponent],
            max: reading.max.forces[envelopeComponent],
            points: diagram.trace(envelopeComponent, reading),
          }
        : null,
    [diagram, reading, envelopeComponent],
  );
  const defaultDiagram = hasPanels
    ? "model"
    : slab
      ? "slab-uz"
      : spatial
        ? "deformed"
        : "m";
  const [loadEditor, setLoadEditor] = useState<LoadDefinitionsPage | null>(
    null,
  );
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
    try {
      localStorage.setItem("kstruct.draft.v32", serialized);
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
  const invalidateResults = useCallback(() => {
    modelRevision.current++;
    setCaseResults(new Map());
    setDisplay("model");
    setPreferredSection(null);
    setMessage(
      "Modelo em edição. Analise a revisão atual para obter resultados.",
    );
  }, []);
  const edit = useCallback(
    (fn: (p: Project) => void) => {
      try {
        const next = structuredClone(current.current);
        fn(next);
        refreshJoint(next);
        if (!projectSchema.safeParse(next).success)
          throw new Error(
            "A alteração contém valores inválidos ou excede os limites do projeto.",
          );
        const errors = referenceErrors(next);
        if (errors.length) throw new Error(errors.join("\n"));
        if (serializeProject(next) !== serializeProject(current.current)) {
          const preserve = sameAnalysisModel(current.current, next);
          current.current = next;
          dispatch({ type: "change", project: next });
          if (!preserve) invalidateResults();
        }
        return null;
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        setMessage(error);
        return error;
      }
    },
    [invalidateResults],
  );
  const selectResult = (value: string) => {
    const selectedEnvelope = p.resultEnvelopes.find(
      (item) => `envelope:${item.id}` === value,
    );
    if (selectedEnvelope) {
      setEnvelopeView("members");
      setDerivedChoice({ kind: "envelope", id: selectedEnvelope.id });
      setTool("select");
      clearPlacement();
      return;
    }
    const selectedCombination = p.resultCombinations.find(
      (item) => `combination:${item.id}` === value,
    );
    if (selectedCombination) {
      setDerivedChoice({ kind: "combination", id: selectedCombination.id });
      setDisplay((value) => (value === "model" ? defaultDiagram : value));
      return;
    }
    const selected = p.analysisCases.find((item) => item.id === value);
    if (!selected) return;
    setDerivedChoice(null);
    setCaseId(selected.id);
    if (caseResults.has(selected.id)) {
      if (slab) showDisplay(isSlabDisplay(display) ? display : "slab-uz");
      else setDisplay((value) => (value === "model" ? defaultDiagram : value));
      setMessage(`Resultados do caso ${selected.name}.`);
    } else {
      setDisplay("model");
      setMessage(`Caso ${selected.name} selecionado. Clique em Analisar.`);
    }
  };
  const [diagnosticHighlight, setDiagnosticHighlight] = useState<
    SelectedObject[]
  >([]);
  const shownSelection =
    launchDialog === "duplicates" ? diagnosticHighlight : selection;
  const isSelected = (kind: SelectedObject["kind"], id: string) =>
    shownSelection.some((s) => s.kind === kind && s.id === id);
  const selectObject = useCallback((object: Selection, additive = false) => {
    if (!additive) setSelection(object ? [object] : []);
    else if (object)
      setSelection((selected) => {
        const same = (s: SelectedObject) =>
          s.kind === object.kind && s.id === object.id;
        return selected.some(same)
          ? selected.filter((s) => !same(s))
          : [...selected, object];
      });
  }, []);
  const activatePanel = (panel: Panel) => {
    if (panel === activePanel) return;
    setActivePanel(panel);
    clearPlacement();
    if (
      (tool === "slab" || tracing) &&
      (panel === "perspective" || viewPlane(panel).plane.kind !== "XY")
    )
      setTool("select");
  };
  const changeLayout = (next: Layout) => {
    setLayout(next);
    clearPlacement();
    setActivePanel("primary");
    if (tool === "slab" || tracing) setTool("select");
    if (next === "planes" || next === "triple")
      setPlanes((v) =>
        v.primary.kind === "XY"
          ? v
          : { ...v, primary: { kind: "XY", guideId: "" } },
      );
  };
  const changeTool = (t: Tool) => {
    if (
      (t === "slab" || t === "slabPolygon") &&
      (!spatial || plane.kind !== "XY" || p.slabs.length >= 2)
    )
      return;
    if (
      t === "slabHole" &&
      (plane.kind !== "XY" || slab?.levelId !== activeGuide.id)
    )
      return;
    if (
      t !== "select" &&
      t !== "pointLoad" &&
      t !== "distributedLoad" &&
      activePanel === "perspective"
    )
      activatePanel("primary");
    setTool(t);
    clearPlacement();
    setDisplay("model");
  };
  const pickMemberLoad = (id: string, point: Point3) => {
    const m = p.members.find((m) => m.id === id)!;
    const line = memberAxis(
      m,
      p.nodes.find((n) => n.id === m.start)!,
      p.nodes.find((n) => n.id === m.end)!,
    );
    const chord = subtract(line.end, line.start);
    const t = dot(subtract(point, line.start), chord) / dot(chord, chord);
    selectObject({ kind: "member", id });
    setMemberLoadDraft({
      kind: tool === "distributedLoad" ? "distributed" : "point",
      memberId: id,
      fraction: Math.max(0, Math.min(1, t)),
    });
  };
  const showDisplay = (value: Display | SlabDisplay) => {
    if (slab && isSlabDisplay(value)) {
      setActivePanel("primary");
      setPlanes((v) => ({
        ...v,
        primary: { kind: "XY", guideId: slab.levelId },
      }));
      setTool("select");
      clearPlacement();
    }
    setDisplay(value);
  };
  const inspectSection = (target: SectionCursor) => {
    if (!envelope) {
      setResultTab("section");
      setDisplay(envelopeComponent);
    }
    selectObject({ kind: "member", id: target.memberId });
    setPreferredSection(target);
    setTool("select");
    clearPlacement();
  };
  const sectionControls =
    diagram && reading
      ? {
          diagram,
          reading,
          component: envelopeComponent,
          onSection: inspectSection,
          onComponent: showDisplay,
        }
      : null;
  const replace = (project: Project) => {
    setResultTab("log");
    invalidateResults();
    current.current = project;
    dispatch({ type: "reset", project });
    setLaunchDialog(null);
    setMemberLoadDraft(null);
    setLaunchSection("");
    setRollText("0");
    setSelection(
      project.slabs.slice(0, 1).map(({ id }) => ({ kind: "slab", id })),
    );
    clearPlacement();
    setActivePanel("primary");
    setPlanes(initialPlanes(project.slabs[0]?.levelId));
    if (
      project.mode === "planar" &&
      (layout === "triple" || layout === "planes")
    )
      setLayout("dual");
    setCaseId(project.analysisCases[0].id);
    setDerivedChoice(null);
    setForceMemberId("");
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
    clearPlacement();
  };
  const finishOutline = () => {
    let id = "";
    const error = edit((draft) => {
      if (tool === "slabHole" && slab && slab.levelId === activeGuide.id) {
        addSlabOpening(draft, slab.id, outline);
        id = slab.id;
      } else if (tool === "slabPolygon")
        id = addPolygonSlab(draft, activeGuide.id, [
          newSlabRing(outline, true),
        ]).id;
      else throw new Error("Ative a planta da laje para lançar a abertura.");
    });
    if (error) {
      setOutlineError(error);
      return;
    }
    selectObject({ kind: "slab", id });
    changeTool("select");
  };
  const undo = () => {
    if (tracing) {
      setOutline((points) => points.slice(0, -1));
      setOutlineError("");
      return;
    }
    if (!history.past.length) return;
    if (!sameAnalysisModel(p, history.past.at(-1)!)) invalidateResults();
    dispatch({ type: "undo" });
    setSelection([]);
    clearPlacement();
  };
  const redo = () => {
    if (!history.future.length) return;
    if (!sameAnalysisModel(p, history.future[0])) invalidateResults();
    dispatch({ type: "redo" });
    setSelection([]);
    clearPlacement();
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        showCuts ||
        loadEditor ||
        memberLoadDraft ||
        launchDialog === "materials" ||
        launchDialog === "sections" ||
        launchDialog === "nodes" ||
        launchDialog === "selection" ||
        settings ||
        confirmation ||
        showRunHistory
      )
        return;
      if (launchDialog) {
        if (e.key === "Escape") setLaunchDialog(null);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        (e.target as HTMLElement).blur();
        setTimeout(() => void save(), 0);
        return;
      }
      if (
        tracing &&
        !(e.target as HTMLElement).closest("input,textarea,select")
      ) {
        if (e.key === "Escape") {
          e.preventDefault();
          changeTool("select");
          return;
        }
        if (
          e.key === "Backspace" ||
          ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z")
        ) {
          e.preventDefault();
          if (!e.shiftKey) undo();
          return;
        }
        if (e.key === "Enter" && !(e.target as HTMLElement).closest("button")) {
          e.preventDefault();
          finishOutline();
          return;
        }
      }
      if (e.key === "Escape" && tool === "member") {
        changeTool("select");
        setSelection([]);
        return;
      }
      if (
        (e.target as HTMLElement).closest(
          "input,textarea,select,button:not(.view-actions button)",
        )
      )
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
        if (
          activePanel === "perspective" &&
          ["b", "n", "l"].includes(e.key.toLowerCase())
        )
          return;
        if (e.key.toLowerCase() === "b") changeTool("member");
        if (e.key.toLowerCase() === "n") changeTool("node");
        if (e.key.toLowerCase() === "l") changeTool("slab");
        if (e.key.toLowerCase() === "v") changeTool("select");
        if (e.key === "Delete") remove();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  const placeMember = (from: Point3, to: Point3) => {
    if (!validRoll) {
      setMessage("Informe uma rotação entre −360° e 360° para lançar a barra.");
      return;
    }
    let memberId = "";
    let end = to;
    const error = edit((draft) => {
      const bar = addMember(draft, from, to, { sectionId, roll });
      memberId = bar.id;
      end = draft.nodes.find((node) => node.id === bar.end)!;
    });
    if (!error) {
      selectObject({ kind: "member", id: memberId });
      setPending(memberMode === "chain" ? end : null);
    }
  };
  const onPoint = (point: Point3) => {
    if (tracing) {
      if (
        outline.length >= 3 &&
        Math.hypot(point.x - outline[0].x, point.y - outline[0].y) < 1e-6
      ) {
        finishOutline();
        return;
      }
      if (outline.length >= maxSlabVertices) {
        setOutlineError(`Use até ${maxSlabVertices} vértices por painel.`);
        return;
      }
      setOutlineError("");
      setOutline((points) => [...points, point]);
      return;
    }
    if (tool === "node") {
      let id = "";
      const error = edit((p) => {
        id = addPoint(p, point).id;
      });
      if (!error) selectObject({ kind: "node", id });
      return;
    }
    if (tool !== "member" && tool !== "slab") return;
    if (!pending) {
      setPending(point);
      return;
    }
    if (tool === "member") {
      placeMember(pending, point);
      return;
    }
    let id = "";
    const error = edit((draft) => {
      id = addSlab(draft, activeGuide.id, pending, point).id;
    });
    if (!error) {
      selectObject({ kind: "slab", id });
      changeTool("select");
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
      ...p.slabs
        .filter((s) => plane.kind === "XY" && s.levelId === activeGuide.id)
        .map((s) => ({ kind: "slab" as const, id: s.id })),
    ]);
  };
  const applyGeometry = (plan: TransformPlan | MemberEdit) => {
    if (("ready" in plan && !plan.ready) || current.current !== plan.source)
      return "O modelo mudou. Reabra a prévia para confirmar.";
    const error = edit((draft) => {
      draft.nodes = plan.project.nodes;
      draft.members = plan.project.members;
      draft.loadPatterns = plan.project.loadPatterns;
      draft.selectionGroups = plan.project.selectionGroups;
      draft.meshConnections = plan.project.meshConnections;
    });
    if (!error) {
      changeTool("select");
      if ("note" in plan) {
        setSelection(plan.selected.map((id) => ({ kind: "member", id })));
        setMessage(plan.note);
      } else {
        setSelection(plan.selected);
        setMessage("Transformação aplicada à seleção.");
      }
    }
    return error;
  };
  const runCase = async (
    snapshot: Project,
    revision: number,
    requestedCase: Project["analysisCases"][number],
  ) => {
    const id = uid();
    setActiveRun({ id, ready: false, cancelling: false });
    let executionLogReceived = false;
    let historyNotice = "";
    try {
      const { execution, input } = await analyze(
        snapshot,
        requestedCase.id,
        executable,
        id,
        () => {
          setActiveRun((active) =>
            active?.id === id ? { ...active, ready: true } : active,
          );
        },
      );
      setLastLog(execution.log);
      executionLogReceived = true;
      historyNotice = execution.historyError
        ? `
${execution.historyError}`
        : "";
      if (
        execution.log.summary.status !== "completed" ||
        execution.output === null
      ) {
        const diagnostics = diagnoseSolverFailure(
          execution.log.summary.message,
          execution.log.stdout,
          execution.log.stderr,
          input,
        );
        if (diagnostics.length)
          saveDiagnosticContext(id, snapshot, diagnostics);
        if (modelRevision.current === revision)
          setAnalysisDiagnostics(diagnostics);
        return {
          status:
            execution.log.summary.status === "cancelled"
              ? ("cancelled" as const)
              : ("failed" as const),
          message: execution.log.summary.message + historyNotice,
        };
      }
      if (modelRevision.current !== revision)
        return { status: "obsolete" as const, message: historyNotice };
      const result = parseOofemOutput(execution.output, input);
      setAnalysisDiagnostics([]);
      setCaseResults((results) => new Map(results).set(result.caseId, result));
      return { status: "completed" as const, result, message: historyNotice };
    } catch (error) {
      const failure = error instanceof Error ? error.message : String(error);
      const diagnostics = diagnoseSolverFailure(failure, "", "");
      if (modelRevision.current === revision)
        setAnalysisDiagnostics(diagnostics);
      if (executionLogReceived)
        saveDiagnosticContext(id, snapshot, diagnostics);
      return { status: "failed" as const, message: failure + historyNotice };
    }
  };

  const run = async (batch: boolean) => {
    if (runLock.current) return;
    const snapshot = current.current;
    const revision = modelRevision.current;
    const context = { revision, target: queueTarget };
    const planned = batch ? missingCases : [analysisCase];
    if (!planned.length) {
      setQueue({
        ...context,
        message: "Todos os casos desta revisão já estão disponíveis.",
      });
      return;
    }
    const modelIssues = diagnoseModel(snapshot);
    setAnalysisDiagnostics(modelIssues);
    setDiagnosticRevision(revision);
    if (modelIssues.length) {
      setDisplay("model");
      const problem = `Análise não iniciada. ${modelIssues.length} ${modelIssues.length === 1 ? "problema" : "problemas"}.
${modelIssues[0].message}`;
      setMessage(problem);
      if (batch) setQueue({ ...context, message: problem });
      return;
    }

    const lock = { stop: false };
    runLock.current = lock;
    if (!batch) {
      setCaseResults((results) => {
        const updated = new Map(results);
        updated.delete(caseId);
        return updated;
      });
    }
    setDisplay("model");

    const warnings: string[] = [];
    try {
      for (const [index, requestedCase] of planned.entries()) {
        if (batch && index > 0) {
          setActiveRun({ id: null, ready: true, cancelling: false });
          setQueue({
            ...context,
            message: `${index} de ${planned.length} casos da fila concluídos.`,
          });
          // Let input and model edits reach the queue before reserving the next native slot.
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
        if (modelRevision.current !== revision || lock.stop) break;

        if (batch)
          setQueue({
            ...context,
            caseId: requestedCase.id,
            message: `Executando ${index + 1} de ${planned.length} · ${requestedCase.name}`,
          });
        setMessage(`Analisando ${requestedCase.name}…`);
        const outcome = await runCase(snapshot, revision, requestedCase);
        if (modelRevision.current !== revision) {
          break;
        }
        if (outcome.status !== "completed") {
          setMessage(outcome.message);
          if (batch)
            setQueue({
              ...context,
              failedId:
                outcome.status === "failed" ? requestedCase.id : undefined,
              message: [
                `${requestedCase.name} · ${outcome.message} Use Analisar casos necessários para retomar.`,
                ...warnings,
              ].join("\n"),
            });
          return;
        }
        if (!batch) {
          showDisplay(defaultDiagram);
          setMessage(
            `Análise concluída · ${requestedCase.name}
Equilíbrio global verificado. ${outcome.result.panels ? "Consulte os deslocamentos e esforços nos eixos locais dos painéis." : outcome.result.slab ? "Consulte a flecha e os mapas de momentos." : "Consulte reações, deslocamentos e esforços."}${outcome.message}`,
          );
          return;
        }
        if (outcome.message)
          warnings.push(`${requestedCase.name} · ${outcome.message.trim()}`);
      }
      if (modelRevision.current !== revision) {
        const obsolete =
          "O modelo mudou durante a análise. Execute novamente para obter resultados atuais.";
        setMessage(obsolete);
        if (batch)
          setQueue({
            target: queueTarget,
            revision: modelRevision.current,
            message: obsolete,
          });
      } else {
        const status = lock.stop
          ? "Fila interrompida. Use Analisar casos necessários para retomar."
          : "Casos necessários concluídos.";
        if (!lock.stop) showDisplay(defaultDiagram);
        setQueue({ ...context, message: [status, ...warnings].join("\n") });
      }
    } finally {
      runLock.current = null;
      setActiveRun(null);
    }
  };
  const inspectDiagnostic = (diagnostic: AnalysisDiagnostic) => {
    const available = diagnostic.objects.filter((object) =>
      object.kind === "node"
        ? p.nodes.some(({ id }) => id === object.id)
        : object.kind === "member"
          ? p.members.some(({ id }) => id === object.id)
          : p.slabs.some(({ id }) => id === object.id),
    );
    if (!available.length) {
      setMessage(
        "Os objetos deste diagnóstico não existem mais no modelo atual.",
      );
      return;
    }
    setTab("Modelo");
    setTool("select");
    clearPlacement();
    const selectedSlab = available.find(({ kind }) => kind === "slab");
    if (spatial && selectedSlab) {
      const item = p.slabs.find(({ id }) => id === selectedSlab.id);
      if (item)
        setPlanes((current) => ({
          ...current,
          primary: { kind: "XY", guideId: item.levelId },
        }));
      setLayout("planes");
      setActivePanel("primary");
    } else if (spatial) {
      setLayout((current) =>
        current === "planes" || current === "single" ? "dual" : current,
      );
      setActivePanel("perspective");
    } else {
      setActivePanel("primary");
    }
    setDisplay("model");
    setSelection(available);
    if (available.length === 1) setRight(true);
    setMessage(diagnostic.action);
  };
  const cancel = async () => {
    const lock = runLock.current;
    if (!lock || !activeRun?.ready || activeRun.cancelling) return;
    lock.stop = true;
    const { id } = activeRun;
    setActiveRun({ ...activeRun, cancelling: true });
    if (!id) return;
    try {
      if (await cancelAnalysis(id)) return;
    } catch (e) {
      if (runLock.current === lock) setMessage(String(e));
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
            onClick={() => setLaunchDialog("new-project")}
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
            disabled={tracing ? !outline.length : !history.past.length}
            onClick={undo}
          >
            <Undo2 size={17} />
          </button>
          <button
            title="Refazer (Ctrl+Shift+Z)"
            aria-label="Refazer"
            disabled={tracing || !history.future.length}
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
                {spatial && (
                  <button
                    className="tool-button"
                    aria-label="Novo painel de carga"
                    title="Distribuir carga às vigas de um retângulo em planta"
                    disabled={p.nodes.length < 3 || !p.members.length}
                    onClick={() =>
                      setLoadPanelDraft(
                        newLoadPanel(p, plane.kind === "XY" ? plane.offset : 0),
                      )
                    }
                  >
                    <Square size={21} />
                    <span>Painel de carga</span>
                  </button>
                )}
                {spatial && (
                  <button
                    className="tool-button"
                    aria-label="Novo painel espacial"
                    title="Lançar uma membrana, placa ou casca por três pontos no espaço"
                    disabled={
                      (p.surfacePanels?.length ?? 0) >= 2 ||
                      !!(p.slabs.length || p.members.length || p.nodes.length)
                    }
                    onClick={() => setPanelDraft(newSurfacePanel(p))}
                  >
                    <Square size={21} />
                    <span>Painel espacial</span>
                  </button>
                )}
                {spatial && (
                  <button
                    className={`tool-button ${tool === "slab" ? "active" : ""}`}
                    title={
                      p.slabs.length >= 2
                        ? "O projeto já contém duas lajes"
                        : "Lançar laje retangular na planta XY (L)"
                    }
                    disabled={plane.kind !== "XY" || p.slabs.length >= 2}
                    onClick={() => changeTool("slab")}
                  >
                    <Square size={21} />
                    <span>Laje</span>
                    <kbd>L</kbd>
                  </button>
                )}
                {spatial && (
                  <button
                    className={`tool-button ${tracing ? "active" : ""}`}
                    aria-pressed={tracing}
                    disabled={
                      plane.kind !== "XY" ||
                      (!!slab && slab.levelId !== activeGuide.id)
                    }
                    title={
                      slab
                        ? "Traçar abertura e analisar o painel com triângulos DKT"
                        : "Traçar o contorno da laje na planta XY"
                    }
                    onClick={() =>
                      changeTool(
                        tracing ? "select" : slab ? "slabHole" : "slabPolygon",
                      )
                    }
                  >
                    <Pentagon size={21} />
                    <span>{slab ? "Abertura na laje" : "Laje poligonal"}</span>
                  </button>
                )}
                {spatial && p.slabs.length === 1 && (
                  <button
                    className="tool-button"
                    disabled={plane.kind !== "XY"}
                    onClick={() => changeTool("slabPolygon")}
                  >
                    <Pentagon size={21} />
                    <span>Segunda laje poligonal</span>
                  </button>
                )}
                {p.slabs.length === 2 && (
                  <button
                    className="tool-button"
                    onClick={() => setJointOpen(true)}
                  >
                    <Square size={21} />
                    <span>Vínculo entre lajes</span>
                  </button>
                )}
                <button
                  className={`tool-button ${tool === "pointLoad" ? "active" : ""}`}
                  aria-pressed={tool === "pointLoad"}
                  disabled={!p.members.length}
                  onClick={() =>
                    changeTool(tool === "pointLoad" ? "select" : "pointLoad")
                  }
                >
                  <ArrowDownToLine size={21} />
                  <span>Carga concentrada</span>
                </button>
                <button
                  className={`tool-button ${tool === "distributedLoad" ? "active" : ""}`}
                  aria-pressed={tool === "distributedLoad"}
                  disabled={!p.members.length}
                  onClick={() =>
                    changeTool(
                      tool === "distributedLoad" ? "select" : "distributedLoad",
                    )
                  }
                >
                  <ChartNoAxesCombined size={21} />
                  <span>Carga por trecho</span>
                </button>
                <button
                  className="tool-button"
                  disabled={!selection.length}
                  onClick={remove}
                >
                  <Trash2 size={19} />
                  <span>Excluir</span>
                </button>
                <button
                  className="tool-button"
                  disabled={
                    !selection.length ||
                    selection.some((obj) => obj.kind !== "member")
                  }
                  onClick={() => setLaunchDialog("member-edit")}
                  title="Dividir, unir, aparar ou prolongar barras selecionadas"
                >
                  <Scissors size={20} />
                  <span>Editar barras</span>
                </button>
                {spatial && (
                  <button
                    className="tool-button"
                    disabled={plane.kind !== "XY"}
                    onClick={() => setLaunchDialog("diaphragms")}
                    title="Editar os vínculos do pavimento na planta XY"
                  >
                    <Layers3 size={20} />
                    <span>Diafragmas</span>
                  </button>
                )}
                <button
                  className="tool-button"
                  disabled={!p.members.length}
                  onClick={() => setLaunchDialog("mesh")}
                  title="Conectar nós e inspecionar as estações de análise"
                >
                  <Waypoints size={20} />
                  <span>Conexões da malha</span>
                </button>
                <button
                  className="tool-button"
                  onClick={() => {
                    setDiagnosticHighlight([]);
                    setLaunchDialog("duplicates");
                  }}
                >
                  <ScanSearch size={20} />
                  <span>Duplicidades</span>
                </button>
                <button
                  className="tool-button"
                  onClick={() => setLaunchDialog("nodes")}
                >
                  <Table2 size={21} />
                  <span>Tabela de nós</span>
                </button>
              </div>
              <small>LANÇAMENTO</small>
            </div>
            {tool === "member" && (
              <div
                className="member-launch"
                role="group"
                aria-label="Lançamento de barras"
              >
                <label>
                  Traçado
                  <select
                    value={memberMode}
                    onChange={(e) => {
                      clearPlacement();
                      setMemberMode(e.target.value as typeof memberMode);
                    }}
                  >
                    <option value="single">Dois pontos</option>
                    <option value="chain">Em cadeia</option>
                    <option value="span">Vão entre eixos</option>
                  </select>
                </label>
                <label>
                  Seção ativa
                  <select
                    value={sectionId}
                    onChange={(e) => setLaunchSection(e.target.value)}
                  >
                    {p.sections.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                {spatial && (
                  <label>
                    Rotação local (°)
                    <input
                      inputMode="decimal"
                      aria-invalid={!validRoll}
                      value={rollText}
                      onChange={(e) => setRollText(e.target.value)}
                    />
                  </label>
                )}
                {!validRoll && <span role="alert">Use −360° a 360°.</span>}
              </div>
            )}
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
              <div className="definition-shortcuts">
                <button
                  className="manage-loads"
                  onClick={() => setLoadEditor("patterns")}
                >
                  <ListChecks size={14} /> Cargas e casos
                </button>
                <button
                  className="manage-loads"
                  onClick={() => setLaunchDialog("materials")}
                >
                  <Library size={14} /> Materiais
                </button>
              </div>
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
                  Viga de referência
                  <small>
                    {formatQuantity(6, "length", units)} {units.length} ·{" "}
                    {formatQuantity(10000, "distributedLoad", units)}{" "}
                    {units.distributedLoad}
                  </small>
                </span>
              </button>
              <small>MODELO DE VALIDAÇÃO</small>
            </div>
          </>
        )}
        {tab === "Análise" && (
          <>
            <div className="ribbon-group">
              <button className="tool-button" onClick={() => setShowCuts(true)}>
                <Scissors size={21} />
                <span>Cortes da estrutura</span>
              </button>
            </div>
            <div className="ribbon-group">
              <button
                className="tool-button"
                onClick={() =>
                  setLoadEditor(
                    envelope
                      ? "envelopes"
                      : combination
                        ? "combinations"
                        : "cases",
                  )
                }
              >
                <ListChecks size={21} />
                <span>Cargas e casos</span>
              </button>
            </div>
            <div className="ribbon-group">
              <button
                className="tool-button"
                onClick={exportDeck}
                disabled={Boolean(derived)}
              >
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
                {hasPanels
                  ? "Estática linear · Painéis espaciais"
                  : slab
                    ? p.slabs.length === 2
                      ? "Estática linear · Lajes acopladas"
                      : "Estática linear · Laje isolada"
                    : spatial
                      ? "Estática linear espacial"
                      : "Estática linear no plano XZ"}
              </b>
              <span>
                {hasPanels
                  ? p
                      .surfacePanels!.map(
                        (v) => v.name + " · " + panelKinds[v.kind],
                      )
                      .join(" / ")
                  : slab
                    ? slab.sizing
                      ? `Placa ${slab.formulation.toUpperCase()} · tamanho-alvo ${formatQuantity(slab.sizing.target, "length", units)} ${units.length}`
                      : slab.polygon
                        ? "Placa triangular DKT · contornos e aberturas"
                        : `Placa ${slab.formulation.toUpperCase()} · ${slab.divisionsX} × ${slab.divisionsY} subdivisões`
                    : `Euler–Bernoulli · ${p.mesh.segmentsPerMember} subdivisões regulares por barra`}
              </span>
              <span>
                {analysisCase.factors.some(
                  (f) =>
                    f.factor !== 0 &&
                    p.loadPatterns.find((pat) => pat.id === f.patternId)
                      ?.selfWeight.enabled,
                )
                  ? "Peso próprio ativo no caso"
                  : "Peso próprio automático desativado no caso"}
              </span>
            </div>
          </>
        )}
        {tab === "Exibição" && (
          <>
            <div className="ribbon-group">
              <div className="ribbon-tools">
                <button
                  className={`tool-button ${left ? "active" : ""}`}
                  aria-pressed={left}
                  onClick={() => setLeft((v) => !v)}
                >
                  <PanelLeft />
                  <span>Explorador</span>
                </button>
                <button
                  className={`tool-button ${right ? "active" : ""}`}
                  aria-pressed={right}
                  onClick={() => setRight((v) => !v)}
                >
                  <PanelRight />
                  <span>Propriedades</span>
                </button>
                <label>
                  Arranjo de vistas
                  <select
                    value={layout}
                    onChange={(e) => changeLayout(e.target.value as Layout)}
                  >
                    <option value="single">Plano de trabalho</option>
                    <option value="dual">Plano + perspectiva</option>
                    {spatial && (
                      <option value="planes">Planta + elevação</option>
                    )}
                    {spatial && (
                      <option value="triple">
                        Planta + elevação + perspectiva
                      </option>
                    )}
                  </select>
                </label>
              </div>
              <small>ÁREA DE TRABALHO</small>
            </div>
            <div className="ribbon-group theme-group">
              <label>
                Tema
                <select
                  value={theme}
                  onChange={(event) => {
                    const next = event.target.value as Theme;
                    setTheme(next);
                    saveTheme(next);
                  }}
                >
                  <option value="dark">Escuro</option>
                  <option value="light">Claro</option>
                </select>
              </label>
            </div>
            <div className="ribbon-group">
              <button
                className="tool-button"
                onClick={() => setShowUnits(true)}
              >
                <Ruler />
                <span>Unidades</span>
              </button>
              <small>APRESENTAÇÃO</small>
            </div>
            <div className="ribbon-group theme-group">
              <button
                aria-pressed={showMemberAxes}
                className="member-axes-toggle"
                onClick={() => setShowMemberAxes((show) => !show)}
              >
                Eixos locais
              </button>
              {hasPanels && (
                <button
                  className="member-axes-toggle"
                  aria-pressed={showPanelAxes}
                  onClick={() => setShowPanelAxes((v) => !v)}
                >
                  Eixos e faces dos painéis
                </button>
              )}
            </div>
          </>
        )}
        <div className="run-group">
          <label>
            {slab || hasPanels
              ? "Caso estático"
              : "Caso, combinação ou envelope"}
            <select
              aria-label={
                slab || hasPanels
                  ? "Caso estático"
                  : "Caso, combinação ou envelope"
              }
              disabled={running}
              value={
                envelope
                  ? `envelope:${envelope.id}`
                  : combination
                    ? `combination:${combination.id}`
                    : caseId
              }
              onChange={(e) => selectResult(e.target.value)}
            >
              <optgroup label="Casos estáticos">
                {p.analysisCases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
              {!hasPanels && !slab && p.resultCombinations.length > 0 && (
                <optgroup label="Combinações lineares">
                  {p.resultCombinations.map((item) => (
                    <option key={item.id} value={`combination:${item.id}`}>
                      {item.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {!hasPanels && !slab && p.resultEnvelopes.length > 0 && (
                <optgroup label="Envelopes">
                  {p.resultEnvelopes.map((item) => (
                    <option key={item.id} value={`envelope:${item.id}`}>
                      {item.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
          <button
            className="run-button"
            disabled={running || Boolean(derived)}
            onClick={() => void run(false)}
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
      {derived && (
        <section className="case-queue" aria-label="Fila de casos">
          <button
            type="button"
            onClick={() => void run(true)}
            disabled={running}
          >
            Analisar casos necessários
          </button>
          <div>
            <div aria-live="polite" className="case-queue-message">
              {queueView?.message ||
                `${requiredCases.length - missingCases.length} de ${requiredCases.length} casos disponíveis nesta revisão.`}
            </div>
            <ol aria-label="Ordem de execução">
              {requiredCases.map((item) => (
                <li key={item.id}>
                  {item.name} [{item.id}] ·{" "}
                  {queueView?.caseId === item.id
                    ? "Em execução"
                    : queueView?.failedId === item.id
                      ? "Falhou"
                      : caseResults.get(item.id)?.caseId === item.id
                        ? "Disponível para reaproveitar"
                        : "Pendente"}
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}
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
                      {n.foundation
                        ? `Fundação · ${n.foundation.name}`
                        : hasElasticSupport(n)
                          ? "Apoio elástico"
                          : hasSupport(n)
                            ? "Apoio"
                            : ""}
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
              {spatial && (
                <details open>
                  <summary>
                    Lajes <span>{p.slabs.length}</span>
                  </summary>
                  {p.slabs.map((slab) => (
                    <button
                      key={slab.id}
                      className={isSelected("slab", slab.id) ? "selected" : ""}
                      aria-pressed={isSelected("slab", slab.id)}
                      onClick={(event) =>
                        selectObject(
                          { kind: "slab", id: slab.id },
                          additiveSelection(event),
                        )
                      }
                    >
                      <Square size={13} /> {slab.name}
                    </button>
                  ))}
                </details>
              )}
              {!!p.loadPanels?.length && (
                <details open>
                  <summary>
                    Painéis de carga <span>{p.loadPanels.length}</span>
                  </summary>
                  {p.loadPanels.map((v) => (
                    <button key={v.id} onClick={() => openLoadPanel(v.id)}>
                      <Square size={13} />
                      {v.name} · Painel de carga
                    </button>
                  ))}
                </details>
              )}
              {hasPanels && (
                <details open>
                  <summary>
                    Painéis espaciais <span>{p.surfacePanels!.length}</span>
                  </summary>
                  {p.surfacePanels!.map((v) => (
                    <button key={v.id} onClick={() => openPanel(v.id)}>
                      <Square size={13} />
                      {v.name} · {panelKinds[v.kind]}
                    </button>
                  ))}
                </details>
              )}
              <details>
                <summary>
                  Seções <span>{p.sections.length}</span>
                </summary>
                {p.sections.map((s) => (
                  <button
                    key={s.id}
                    title={`${shapeNames[s.shape]} · ${dimensions(s)
                      .map(
                        ({ label, value }) =>
                          `${label}: ${formatQuantity(value, "section", units)} ${units.section}`,
                      )
                      .join(", ")}`}
                    onClick={() => openSections(s.id)}
                  >
                    {s.name}
                  </button>
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
              <span aria-label="Vista ativa">
                {activePanel === "perspective"
                  ? "Perspectiva 3D"
                  : `${plane.kind === "XY" ? "Planta" : "Elevação"} ${plane.kind} · ${planeCoordinates[plane.kind][2].toUpperCase()} = ${formatQuantity(plane.offset, "length", units)} ${units.length}`}
              </span>
              <span className="model-count">
                {p.nodes.length} nós · {p.members.length} barras
                {hasPanels &&
                  ` · ${p.surfacePanels!.length} ${p.surfacePanels!.length === 1 ? "painel espacial" : "painéis espaciais"}`}
                {!!p.loadPanels?.length &&
                  ` · ${p.loadPanels.length} ${p.loadPanels.length === 1 ? "painel de carga" : "painéis de carga"}`}
                {p.slabs.length > 0 &&
                  ` · ${p.slabs.length} ${p.slabs.length === 1 ? "laje" : "lajes"}`}
              </span>
            </div>
            {!spatial && (
              <button
                className="selection-trigger"
                disabled={
                  !selection.length || selection.some((s) => s.kind === "slab")
                }
                onClick={() => setLaunchDialog("replicate")}
              >
                Transformar
              </button>
            )}
            <button
              className="selection-trigger"
              onClick={() => {
                clearPlacement();
                setTool("select");
                setLaunchDialog("selection");
              }}
            >
              Seleção e grupos
            </button>
            <select
              aria-label="Visualização dos resultados"
              value={showSlabMap ? display : visibleDisplay}
              onChange={(e) =>
                showDisplay(e.target.value as Display | SlabDisplay)
              }
            >
              {!showEnvelope && (
                <option value="model">Geometria e cargas</option>
              )}
              {slabResult &&
                Object.entries(slabDisplays).map(([key, field]) => (
                  <option key={key} value={key}>
                    {field.label}
                  </option>
                ))}
              {!hasPanels && !slab && result && (
                <option value="deformed">Deformada ampliada</option>
              )}
              {!hasPanels && !slab && (result || showEnvelope) && (
                <>
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
              inactive={activePanel === "perspective"}
              kinds={
                splitPlanes
                  ? planePanel === "primary"
                    ? ["XY"]
                    : ["XZ", "YZ"]
                  : ["XY", "XZ", "YZ"]
              }
              kind={plane.kind}
              guideId={activeGuide.id}
              guides={planeGuides}
              orthogonal={orthogonal}
              selected={
                selection.some(({ kind }) => kind === "slab")
                  ? 0
                  : selection.length
              }
              onPlane={(kind) => {
                clearPlacement();
                setPlanes((v) => ({
                  ...v,
                  [planePanel]: { kind, guideId: "" },
                }));
                if (tool === "slab" || tracing) changeTool("select");
              }}
              onGuide={(id) => {
                if (tracing) changeTool("select");
                setPlanes((v) => ({
                  ...v,
                  [planePanel]: { kind: plane.kind, guideId: id },
                }));
                clearPlacement();
              }}
              toggleOrtho={() => setOrthogonal((v) => !v)}
              editGuides={() => {
                clearPlacement();
                setLaunchDialog("guides");
              }}
              selectPlane={selectPlane}
              replicate={() => setLaunchDialog("replicate")}
              connect={() => setLaunchDialog("mesh")}
            />
          )}
          {tracing && (
            <div className="slab-trace-controls" aria-label="Traçado da laje">
              <span>
                {tool === "slabHole" ? "Abertura" : "Contorno externo"} ·{" "}
                {outline.length} vértices
              </span>
              <button disabled={outline.length < 3} onClick={finishOutline}>
                Fechar contorno
              </button>
              <button disabled={!outline.length} onClick={undo}>
                Desfazer vértice
              </button>
              <button onClick={() => changeTool("select")}>
                Cancelar traçado
              </button>
              {outlineError && <span role="alert">{outlineError}</span>}
            </div>
          )}
          <div className={`viewports ${layout}`}>
            {(
              (splitPlanes
                ? ["primary", "elevation"]
                : ["primary"]) as PlanePanel[]
            ).map((panel) => {
              const view = viewPlane(panel);
              const active = panel === activePanel;
              const [layers, setLayers] =
                panel === "primary" ? primaryLayers : elevationLayers;
              return (
                <WorkPlaneView
                  key={panel}
                  layers={layers}
                  setLayers={setLayers}
                  savedCamera={
                    panel === "primary" ? primaryCamera : elevationCamera
                  }
                  active={active}
                  onActivate={() => activatePanel(panel)}
                  project={p}
                  showPanelAxes={showPanelAxes}
                  showMemberAxes={showMemberAxes}
                  plane={view.plane}
                  orthogonal={orthogonal}
                  selection={shownSelection}
                  tool={active ? tool : "select"}
                  quick={active && tool === "member" && memberMode === "span"}
                  result={result}
                  envelope={
                    showEnvelope && envelopeResult
                      ? envelopeResult.members
                      : null
                  }
                  sectionPlot={sectionPlot}
                  onSection={inspectSection}
                  display={visibleDisplay}
                  floorMaps={floorMaps}
                  slabMap={
                    view.plane.kind === "XY" && view.guide.id === slab?.levelId
                      ? slabMap
                      : null
                  }
                  resultPatterns={resultPatterns}
                  patternId={patternId}
                  onWindow={(objects, additive) =>
                    setSelection((previous) =>
                      combineSelection(
                        previous,
                        objects,
                        additive ? "add" : "replace",
                      ),
                    )
                  }
                  onPickLoad={choosingMemberLoad ? pickMemberLoad : undefined}
                  onSpan={placeMember}
                  outline={active && tracing ? outline : []}
                  pending={active ? pending : null}
                  onPoint={onPoint}
                  onSelect={selectObject}
                  onPanel={openPanel}
                  onLoadPanel={openLoadPanel}
                  onJoint={() => setJointOpen(true)}
                />
              );
            })}
            {perspective && (
              <SpatialView
                onPanel={openPanel}
                onLoadPanel={openLoadPanel}
                onPickLoad={choosingMemberLoad ? pickMemberLoad : undefined}
                layers={perspectiveLayers}
                setLayers={setPerspectiveLayers}
                savedCamera={perspectiveCamera}
                active={activePanel === "perspective"}
                onActivate={() => activatePanel("perspective")}
                patternId={patternId}
                theme={theme}
                project={p}
                showPanelAxes={showPanelAxes}
                showMemberAxes={showMemberAxes}
                selection={shownSelection}
                result={visibleDisplay === "deformed" ? result : null}
                onSelect={selectObject}
              />
            )}
          </div>
          {p.slabJoint && (
            <div className="joint-legend" aria-label="Legenda da borda comum">
              <span>○ Articulada</span>
              <span>⌁ Semirrígida</span>
              <span>═ Contínua</span>
              <span className="legend-free-edge">Borda livre</span>
              <b>
                {jointPanels(p)
                  .map((s) => s.name)
                  .join(" ↔ ")}{" "}
                · {jointNames[p.slabJoint.kind]}
                {p.slabJoint.stiffness
                  ? ` · ${formatQuantity(p.slabJoint.stiffness, "moment", units)} ${units.moment}/(rad·m)`
                  : ""}{" "}
                ·{" "}
                {p.slabJoint.support === "beam"
                  ? "Viga " +
                    p.members.find((m) => m.id === p.slabJoint?.memberId)?.name
                  : p.slabJoint.support === "line"
                    ? "Apoio vertical"
                    : "Sem apoio externo"}
              </b>
            </div>
          )}
          {showSlabMap && slab ? (
            <SlabLegend
              map={showSlabMap}
              name={
                floorMaps.length
                  ? jointPanels(p)
                      .map((s) => s.name)
                      .join(" e ")
                  : slab.name
              }
              caseName={analysisCase.name}
            />
          ) : showEnvelope ? (
            <div className="diagram-caption envelope-legend">
              <span className="envelope-max-label">Máximo</span>
              <span className="envelope-min-label">Mínimo</span>
              <span>
                N positivo em tração · Clique no diagrama para consultar uma
                estação.
              </span>
            </div>
          ) : (
            visibleDisplay !== "model" && (
              <div className="diagram-caption">
                {visibleDisplay === "deformed"
                  ? "Deformada ampliada automaticamente. Valores reais na tabela de deslocamentos."
                  : spatial
                    ? "x/L vai da face i (0) à face j (1) do trecho deformável. Esforços nos eixos locais, na face +x. N positivo em tração."
                    : "x/L vai da face i (0) à face j (1) do trecho deformável. N positivo em tração. M positivo sagente em barras horizontais orientadas +X."}
              </div>
            )
          )}
          {areaComparisonKey && (
            <div className="area-comparison-trigger">
              <AreaComparison
                key={areaComparisonKey}
                project={p}
                cases={caseResults}
                caseId={caseId}
                areaId={slab?.id}
              />
            </div>
          )}
          {hasPanels ? (
            <SurfacePanelResults
              result={caseResult?.panels}
              caseName={analysisCase.name}
              message={message}
            />
          ) : slab ? (
            <SlabResults
              comparisonKey={JSON.stringify([
                p.id,
                slab.id,
                ...(p.slabJoint
                  ? [
                      p.slabJoint,
                      p.slabs.map((s) => [
                        s.id,
                        slabRings(s),
                        s.thickness,
                        s.materialId,
                      ]),
                      p.members,
                      p.nodes,
                      p.sections,
                      p.materials,
                    ]
                  : []),
                slab.thickness,
                slabRings(slab),
                p.guides.z.find((g) => g.id === slab.levelId),
                p.materials.find((m) => m.id === slab.materialId),
                analysisCase,
                analysisCase.factors.map((f) => {
                  const pat = p.loadPatterns.find(
                    (pat) => pat.id === f.patternId,
                  );
                  return p.slabJoint ? pat : [pat?.pressure, pat?.selfWeight];
                }),
              ])}
              slab={slab}
              floor={caseResult?.floor}
              frameReactionZ={caseResult?.reactions.reduce(
                (sum, r) => sum + r.fz,
                0,
              )}
              panelNames={jointPanels(p).map((s) => s.name)}
              caseName={analysisCase.name}
              result={slabResult}
              rawOutput={slabResult ? caseResult?.rawOutput : undefined}
              message={message}
              running={running}
              openRunHistory={
                lastLog ? () => setShowRunHistory(true) : undefined
              }
              onExportError={setMessage}
            />
          ) : envelope ? (
            <EnvelopeResults
              view={envelopeView}
              onView={setEnvelopeView}
              key={envelope.id}
              project={p}
              envelope={envelope}
              result={envelopeResult}
              component={envelopeComponent}
              controls={sectionControls}
              problem={envelopeState?.problem ?? "Calculando envelope…"}
            />
          ) : (
            <Results
              project={p}
              forceMemberId={forceMemberId}
              tab={resultTab}
              onTab={(tab) => {
                setResultTab(tab);
                if (tab === "section") showDisplay(envelopeComponent);
              }}
              controls={sectionControls}
              onForceMemberChange={(id) => {
                setForceMemberId(id);
                if (id) selectObject({ kind: "member", id });
              }}
              view={
                combination && combined
                  ? {
                      kind: "combination",
                      definition: combination,
                      ...combined,
                    }
                  : {
                      kind: "case",
                      definition: analysisCase,
                      result: caseResult,
                    }
              }
              message={message}
              running={running}
              cancelling={activeRun?.cancelling ?? false}
              diagnostics={analysisDiagnostics}
              diagnosticsNavigable={
                diagnosticRevision === modelRevision.current
              }
              onInspectDiagnostic={inspectDiagnostic}
              openRunHistory={
                lastLog ? () => setShowRunHistory(true) : undefined
              }
            />
          )}
        </main>
        {loadPanelDraft && (
          <LoadPanelDialog
            key={loadPanelDraft.id}
            project={p}
            initial={loadPanelDraft}
            activePattern={patternId}
            edit={edit}
            close={() => setLoadPanelDraft(null)}
          />
        )}
        {panelDraft && (
          <SurfacePanelDialog
            key={panelDraft.id}
            panel={panelDraft}
            project={p}
            patternId={patternId}
            close={() => setPanelDraft(null)}
            remove={
              p.surfacePanels?.some((v) => v.id === panelDraft.id)
                ? () => {
                    const err = edit((d) => {
                      d.surfacePanels = d.surfacePanels?.filter(
                        (v) => v.id !== panelDraft.id,
                      );
                      for (const pat of d.loadPatterns)
                        if (pat.panelActions)
                          pat.panelActions = pat.panelActions.filter(
                            (a) => a.panelId !== panelDraft.id,
                          );
                    });
                    if (!err) setPanelDraft(null);
                  }
                : undefined
            }
            apply={(panel, action) =>
              edit((d) => {
                const items = (d.surfacePanels ??= []),
                  index = items.findIndex((v) => v.id === panel.id);
                if (index < 0) items.push(panel);
                else items[index] = panel;
                d.surfacePanels = items;
                const pat = d.loadPatterns.find((v) => v.id === patternId)!;
                const actions = (pat.panelActions ?? []).filter(
                  (a) => a.panelId !== panel.id,
                );
                if (
                  action.pressure ||
                  action.distribution ||
                  Object.values(action.traction).some(Boolean)
                )
                  actions.push(action);
                if (actions.length) pat.panelActions = actions;
                else delete pat.panelActions;
              })
            }
          />
        )}
        {jointOpen && (
          <SlabJointDialog
            project={p}
            apply={(joint) =>
              edit((d) => {
                d.slabJoint = joint;
              })
            }
            close={() => setJointOpen(false)}
          />
        )}
        {right && (
          <Inspector
            onMemberLoad={setMemberLoadDraft}
            onPatternChange={setPatternId}
            onSections={openSections}
            onMaterials={() => setLaunchDialog("materials")}
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
          {envelopeResult
            ? "Envelope disponível"
            : result
              ? combination
                ? "Combinação disponível"
                : "Análise concluída"
              : running
                ? "Análise em andamento"
                : "Modelo em edição"}
        </span>
        <span>
          {tool === "pointLoad"
            ? "Clique na barra na posição da força ou do momento"
            : tool === "distributedLoad"
              ? "Clique na barra para indicar o início da carga por trecho"
              : tracing
                ? "Marque os vértices em sequência · Enter ou primeiro vértice para fechar · Esc para cancelar"
                : tool === "slab"
                  ? pending
                    ? "Marque o canto oposto da laje · Esc para cancelar"
                    : "Marque o primeiro canto da laje na planta XY"
                  : pending
                    ? "Marque a segunda extremidade · Esc para cancelar"
                    : tool === "member"
                      ? memberMode === "span"
                        ? "Aponte para um eixo no interior do vão, afastado dos cruzamentos"
                        : "Marque a primeira extremidade da barra"
                      : tool === "node"
                        ? "Clique na malha para inserir um nó"
                        : selection.length > 1
                          ? `${selection.length} objetos selecionados`
                          : "Selecione um objeto · Ctrl ou Shift para seleção múltipla"}
        </span>
        <span>
          {units.force} · {units.length} · rad <i />{" "}
          {desktop() ? "Desktop" : "Navegador · edição"} <i /> OpenStruct
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
              if (f.size > projectFileLimit)
                throw new Error("Arquivo maior que 5 MB.");
              replace(parseProject(await f.text()));
            } catch (e) {
              setMessage(String(e));
            }
          }
          e.target.value = "";
        }}
      />
      {memberLoadDraft && loadedMember && (
        <MemberLoadDialog
          key={memberLoadDraft.loadId ?? loadedMember.id}
          project={p}
          member={loadedMember}
          pattern={p.loadPatterns.find((item) => item.id === patternId)!}
          selection={memberLoadDraft}
          edit={edit}
          onClose={() => {
            setMemberLoadDraft(null);
            changeTool("select");
          }}
        />
      )}
      {showUnits && <UnitsDialog onClose={() => setShowUnits(false)} />}
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
      {showCuts && (
        <SectionCutsDialog
          project={p}
          cases={caseResults}
          initialSource={
            combination ? "combination:" + combination.id : "case:" + caseId
          }
          edit={edit}
          close={() => setShowCuts(false)}
        />
      )}
      {showRunHistory && (
        <RunHistory
          latest={lastLog}
          project={p}
          onClose={() => setShowRunHistory(false)}
          onInspect={(diagnostic) => {
            setShowRunHistory(false);
            inspectDiagnostic(diagnostic);
          }}
        />
      )}
      {loadEditor && (
        <LoadDefinitions
          project={p}
          initialPage={loadEditor}
          initialPatternId={patternId}
          initialCaseId={caseId}
          initialCombinationId={
            combination?.id ?? p.resultCombinations[0]?.id ?? ""
          }
          initialEnvelopeId={envelope?.id ?? p.resultEnvelopes[0]?.id ?? ""}
          onClose={() => setLoadEditor(null)}
          onApply={(definitions, next) => {
            const problem = edit((project) => {
              project.loadPatterns = definitions.loadPatterns;
              project.analysisCases = definitions.analysisCases;
              project.resultCombinations = definitions.resultCombinations;
              project.resultEnvelopes = definitions.resultEnvelopes;
              if (definitions.combinationProfile)
                project.combinationProfile = definitions.combinationProfile;
            });
            if (problem) return problem;
            setPatternId(next.patternId);
            setCaseId(next.caseId);
            setDerivedChoice(
              next.envelopeId
                ? { kind: "envelope", id: next.envelopeId }
                : next.combinationId
                  ? { kind: "combination", id: next.combinationId }
                  : null,
            );
            if (next.envelopeId) {
              setEnvelopeView("members");
              setTool("select");
              clearPlacement();
            }
            setDisplay("model");
            setMessage("Definições de carga aplicadas.");
            return null;
          }}
        />
      )}
      {launchDialog === "diaphragms" && (
        <DiaphragmDialog
          project={p}
          levelId={activeGuide.id}
          selection={selection}
          edit={edit}
          onClose={() => setLaunchDialog(null)}
        />
      )}
      {launchDialog === "selection" && (
        <SelectionDialog
          project={p}
          selection={selection}
          edit={edit}
          onSelect={setSelection}
          onClose={() => setLaunchDialog(null)}
        />
      )}
      {launchDialog === "nodes" && (
        <NodeTable
          project={p}
          onClose={() => setLaunchDialog(null)}
          onApply={(changes) => {
            const problem = edit((project) => {
              const { nodes, issues } = inspectNodeCoordinateChanges(
                project,
                changes,
              );
              if (issues.length)
                throw new Error(issues.map(({ message }) => message).join(" "));
              project.nodes = nodes;
            });
            if (!problem)
              setMessage(
                "Coordenadas atualizadas. Clique em Analisar para calcular o caso.",
              );
            return problem;
          }}
          onImportTabular={(plan) => {
            const problem = edit((project) =>
              applyTabularImport(project, plan),
            );
            if (!problem)
              setMessage(
                `Importação concluída: ${plan.counts.nodesCreated} nós criados, ${plan.counts.nodesUpdated} atualizados · ${plan.counts.membersCreated} barras criadas, ${plan.counts.membersUpdated} atualizadas.`,
              );
            return problem;
          }}
        />
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
      {launchDialog === "duplicates" && (
        <DuplicateDialog
          project={p}
          onHighlight={setDiagnosticHighlight}
          onClose={() => setLaunchDialog(null)}
          onApply={(source, next) => {
            if (current.current !== source)
              return "O modelo mudou. Reabra o diagnóstico.";
            const error = edit((draft) => {
              draft.nodes = next.nodes;
              draft.members = next.members;
              draft.loadPatterns = next.loadPatterns;
              draft.selectionGroups = next.selectionGroups;
              draft.meshConnections = next.meshConnections;
            });
            if (!error) {
              changeTool("select");
              setSelection([]);
              setMessage(
                "Correções aplicadas. Reabra Duplicidades para consultar os pares restantes.",
              );
            }
            return error;
          }}
        />
      )}
      {launchDialog === "sections" && (
        <SectionCatalog
          initialId={catalogSectionId}
          project={p}
          edit={edit}
          onClose={() => setLaunchDialog(null)}
        />
      )}
      {launchDialog === "materials" && (
        <MaterialLibrary
          project={p}
          selection={selection}
          edit={edit}
          onClose={() => setLaunchDialog(null)}
        />
      )}
      {launchDialog === "mesh" && (
        <MeshConnections
          project={p}
          selection={selection}
          edit={edit}
          onClose={() => setLaunchDialog(null)}
        />
      )}
      {launchDialog === "member-edit" && (
        <MemberEditDialog
          project={p}
          ids={selection.map((s) => s.id)}
          plane={plane.kind}
          onClose={() => setLaunchDialog(null)}
          onApply={applyGeometry}
        />
      )}
      {launchDialog === "replicate" && (
        <TransformDialog
          project={p}
          selection={selection}
          plane={plane.kind}
          initial={{
            ...origin,
            x: plane.kind === "XY" ? 0 : 1,
            z:
              plane.kind === "XY"
                ? ([...p.guides.z]
                    .sort((a, b) => a.position - b.position)
                    .find((g) => g.position > plane.offset)?.position ??
                    plane.offset) - plane.offset
                : 0,
          }}
          onApply={applyGeometry}
          onClose={() => setLaunchDialog(null)}
        />
      )}
      {launchDialog === "new-project" && (
        <NewProjectDialog
          onClose={() => setLaunchDialog(null)}
          onCreate={(project) =>
            protect("Substituir o projeto atual", () => replace(project))
          }
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
