import { foldedPanels } from "../fixtures/spatial-panels";
import { jointedSlabs } from "../fixtures/jointed-slabs";
import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { formatResult } from "../../src/components/resultFormatting";
import {
  createProject,
  parseProject,
  serializeProject,
} from "../../src/domain/model";
import { addPolygonSlab, newSlabRing } from "../../src/domain/editing";
import { openProjectInBrowser } from "../fixtures/open-project";
import { slabBenchmarkProject } from "../fixtures/slab-benchmark";
import { exportOofem, parseOofemOutput } from "../../src/solver/oofem";
import { runDeck } from "../fixtures/solve-oofem";

const executable = process.env.OOFEM_BIN;

type RunArgs = {
  deck: string;
  runContext: { runId: string; caseName: string; projectName: string };
  response: { onmessage: (value: unknown) => void };
};
type SlabTestWindow = Window & {
  isTauri: boolean;
  __TAURI_INTERNALS__: {
    transformCallback: () => number;
    invoke: (command: string, args: RunArgs) => Promise<void>;
  };
  finishSlabAnalysis?: () => Promise<void>;
  solveSlabDeck: (deck: string) => Promise<string>;
};

async function plateBridge(page: Page) {
  await page.exposeFunction("solveSlabDeck", (deck: string) =>
    runDeck(deck, executable!),
  );
  await page.addInitScript(() => {
    if (sessionStorage.getItem("slab-ipc") !== "enabled") return;
    const w = window as unknown as SlabTestWindow;
    let callbackId = 0;
    w.isTauri = true;
    w.__TAURI_INTERNALS__ = {
      transformCallback: () => ++callbackId,
      invoke: async (command, args) => {
        if (command !== "start_oofem")
          throw new Error(`IPC inesperado no teste: ${command}`);
        w.finishSlabAnalysis = async () => {
          delete w.finishSlabAnalysis;
          const output = await w.solveSlabDeck(args.deck);
          args.response.onmessage({
            output,
            log: {
              summary: {
                ...args.runContext,
                status: "completed",
                message: "Execução concluída.",
              },
              stdout: "",
              stderr: "",
              logTruncated: false,
            },
            historyError: null,
          });
        };
      },
    };
  });
}

for (const formulation of ["qdkt", "dkt"] as const) {
  test(`lança, salva, reabre e consulta a laje ${formulation.toUpperCase()} do benchmark`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    if (executable) await plateBridge(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Novo pórtico espacial" }).click();
    await page.getByLabel("Pavimento ativo").selectOption("level1");
    const slabTool = page.getByRole("button", { name: /^Laje L$/ });
    await slabTool.click();
    const drawing = page.getByRole("application", {
      name: "Área de lançamento XY",
    });
    const corners = await drawing.evaluate((svg) => {
      const pos = (axis: "x" | "y", v: number) =>
        Number(
          svg
            .querySelector(`line[data-axis="${axis}"][data-position="${v}"]`)!
            .getAttribute(`${axis}1`),
        );
      return [
        { x: pos("x", 0), y: pos("y", 0) },
        { x: pos("x", 4), y: 0.25 * pos("y", 0) + 0.75 * pos("y", 4) },
      ];
    });
    for (const position of corners) await drawing.click({ position });
    await expect(page.locator(".model-count")).toHaveText(
      "0 nós · 0 barras · 1 laje",
    );
    await expect(page.getByLabel("Lado X")).toHaveValue("4");
    await expect(page.getByLabel("Lado Y")).toHaveValue("3");
    await expect(page.getByLabel("Pavimento da laje")).toHaveValue("level1");
    const properties = page.getByLabel("Propriedades do material");
    await expect(properties).toContainText("30 GPa");
    await expect(properties).toContainText("0,2");
    await page
      .getByRole("button", { name: "Abrir material na biblioteca" })
      .click();
    const library = page.getByRole("dialog", {
      name: "Biblioteca de materiais",
    });
    await expect(
      library.getByLabel("Material do projeto").locator("option:checked"),
    ).toHaveText("Concreto");
    await library
      .getByRole("button", { name: "Editar material", exact: true })
      .click();
    await expect(
      library.getByRole("region", { name: "Uso do material" }),
    ).toContainText("1 laje · L1");
    await library.getByRole("button", { name: "Cancelar edição" }).click();
    await library.getByRole("button", { name: "Fechar", exact: true }).click();
    await expect(page.getByLabel("Espessura")).toHaveValue("10");
    await expect(drawing.locator(".slab-supported-edge")).toHaveCount(4);
    const element = page.getByLabel("Elemento de placa");
    await expect(element).toHaveValue("qdkt");
    await element.selectOption(formulation);
    const endSupport = page.getByLabel("Apoio simples na borda X máx.");
    await endSupport.uncheck();
    await expect(drawing.locator(".slab-supported-edge")).toHaveCount(3);
    await endSupport.check();

    const setField = async (label: string, value: string) => {
      const field = page.getByLabel(label, { exact: true });
      await field.fill(value);
      await field.press("Enter");
    };
    await setField("Pressão pZ", "-5");
    const save = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Salvar projeto", exact: true })
      .click();
    const path = (await (await save).path())!;
    const project = parseProject(await readFile(path, "utf8"));
    expect(project.slabs[0]).toMatchObject({
      formulation,
      thickness: 0.1,
      divisionsX: 8,
      divisionsY: 6,
      levelId: "level1",
    });
    expect(project.loadPatterns[0].pressure).toEqual([
      { slabId: project.slabs[0].id, pz: -5000 },
    ]);
    await page
      .getByRole("button", { name: "Novo projeto", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Novo projeto" })
      .getByRole("button", { name: "Criar projeto", exact: true })
      .click();
    const open = page.waitForEvent("filechooser");
    await page
      .getByRole("button", { name: "Abrir projeto", exact: true })
      .click();
    await (
      await open
    ).setFiles({
      name: "laje.kstruct.json",
      mimeType: "application/json",
      buffer: await readFile(path),
    });
    await expect(page.getByLabel("Pressão pZ")).toHaveValue("-5");
    await expect(page.getByLabel("Pavimento ativo")).toHaveValue("level1");

    await page.getByRole("button", { name: "Análise", exact: true }).click();
    const exported = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Entrada OOFEM", exact: true })
      .click();
    const deck = await readFile((await (await exported).path())!, "utf8");
    const input = exportOofem(project, "EL");
    expect(deck).toEqual(input.deck);
    if (formulation === "qdkt") {
      expect(deck).toContain("qdktplate 1 nodes 4 11 10 1 2");
      expect(deck).toContain("components 3 -5000 0 0 csType 0");
    }

    if (!executable) return; // The frontend job still verifies creation, persistence and export.
    const expected = parseOofemOutput(runDeck(deck, executable), input).slab!;
    await page.evaluate(() => sessionStorage.setItem("slab-ipc", "enabled"));
    await page.reload();
    const analyze = page.getByRole("button", { name: "Analisar", exact: true });
    const finish = async () => {
      await page.waitForFunction(
        () =>
          (window as unknown as SlabTestWindow).finishSlabAnalysis !==
          undefined,
      );
      await page.evaluate(() =>
        (window as unknown as SlabTestWindow).finishSlabAnalysis!(),
      );
    };
    await analyze.click();
    await finish();
    const display = page.getByLabel("Visualização dos resultados");
    const table = page.getByRole("table", {
      name: "Flecha e momentos no centro da laje",
    });
    await expect(display).toHaveValue("slab-uz");
    await expect(drawing.locator(".slab-map polygon")).toHaveCount(
      formulation === "qdkt" ? 48 : 96,
    );
    await expect(
      table.getByRole("cell", {
        name: formatResult(expected.center.uz * 1000),
        exact: true,
      }),
    ).toBeVisible();
    for (const [component, label] of [
      ["mx", "Mx"],
      ["my", "My"],
    ] as const) {
      await display.selectOption(`slab-${component}`);
      await expect(page.getByLabel("Legenda do mapa da laje")).toContainText(
        `L1 · Momento local ${label}`,
      );
      await expect(page.getByLabel("Legenda do mapa da laje")).toContainText(
        "kN·m/m",
      );
      await expect(
        table.getByRole("cell", {
          name: formatResult(expected.center[component] / 1000),
          exact: true,
        }),
      ).toBeVisible();
    }
    await page.screenshot({
      path: `test-results/kstruct-slab-${formulation}.png`,
      fullPage: true,
    });

    await page
      .locator(".explorer")
      .getByRole("button", { name: "L1", exact: true })
      .click();
    await setField("Subdivisões em X", "16");
    await expect(display).toHaveValue("model");
    await expect(table).toHaveCount(0);
    await analyze.click();
    await setField("Subdivisões em Y", "12");
    await finish();
    await expect(page.getByRole("status")).toContainText(
      "O modelo mudou durante a análise",
    );
    await expect(drawing.locator(".slab-map")).toHaveCount(0);
    await analyze.click();
    await finish();
    await expect(drawing.locator(".slab-map polygon")).toHaveCount(
      formulation === "qdkt" ? 192 : 384,
    );
    await page.getByRole("button", { name: "Desfazer", exact: true }).click();
    await expect(table).toHaveCount(0);
    await page.getByRole("button", { name: "Refazer", exact: true }).click();
    await expect(table).toHaveCount(0);
  });
}

test("KS-41 · desenha, edita e reabre uma laje em L com abertura na planta", async ({
  page,
}) => {
  test.setTimeout(60000);
  if (executable) await plateBridge(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Novo pórtico espacial" }).click();
  await page.getByLabel("Pavimento ativo").selectOption("level1");
  const drawing = page.getByRole("application", {
    name: "Área de lançamento XY",
  });
  const clickAt = async (x: number, y: number) => {
    const position = await drawing.evaluate(
      (svg, [x, y]) => {
        const coord = (axis: "x" | "y", v: number) =>
          Number(
            svg
              .querySelector(`line[data-axis="${axis}"][data-position="${v}"]`)!
              .getAttribute(`${axis}1`),
          );
        return {
          x: coord("x", 0) + ((coord("x", 4) - coord("x", 0)) * x) / 4,
          y: coord("y", 0) + ((coord("y", 4) - coord("y", 0)) * y) / 4,
        };
      },
      [x, y],
    );
    await drawing.click({ position });
  };
  const trace = async (points: number[][]) => {
    for (const [x, y] of points) await clickAt(x, y);
  };
  const button = (name: string) =>
    page.getByRole("button", { name, exact: true });
  await button("Laje poligonal").click();
  await trace([
    [0, 0],
    [1, 0],
  ]);
  await expect(drawing.locator(".slab-trace circle")).toHaveCount(2);
  await button("Desfazer vértice").click();
  await expect(drawing.locator(".slab-trace circle")).toHaveCount(1);
  await button("Cancelar traçado").click();
  await expect(drawing.locator(".slab-plan")).toHaveCount(0);
  await button("Laje poligonal").click();
  await trace([
    [0, 0],
    [6, 0],
    [6, 2],
    [3, 2],
    [3, 4],
    [0, 4],
    [0, 0],
  ]);
  await expect(drawing.locator(".slab-supported-edge")).toHaveCount(6);
  await button("Abertura na laje").click();
  await trace([
    [4, 2.5],
    [5, 2.5],
    [5, 3.5],
  ]);
  await button("Fechar contorno").click();
  await expect(page.getByRole("alert")).toContainText(/fora do contorno/);
  await button("Cancelar traçado").click();
  await button("Abertura na laje").click();
  await trace([
    [1, 0.5],
    [2, 0.5],
    [2, 1.5],
    [1, 1.5],
  ]);
  await button("Fechar contorno").click();
  await expect(drawing.locator(".slab-free-edge")).toHaveCount(4);
  await expect(page.locator(".slab-contour-fields")).toContainText("17 m²");
  const pressure = page.getByLabel("Pressão pZ", { exact: true });
  await pressure.fill("-5");
  await pressure.press("Enter");
  const save = async () => {
    const download = page.waitForEvent("download");
    await button("Salvar projeto").click();
    return await readFile((await (await download).path())!, "utf8");
  };
  const before = await save();
  const original = parseProject(before);
  const selectSlab = () =>
    page
      .locator(".explorer")
      .getByRole("button", { name: "L1", exact: true })
      .click();
  await page.getByLabel("Contorno da laje").selectOption("1");
  await page.getByLabel("Vínculo da borda").selectOption("simple");
  await page.getByLabel("X do vértice").fill("1,25");
  await button("Aplicar vértice").click();
  const edited = await save();
  const updated = parseProject(edited);
  const savedRing = updated.slabs[0].polygon!.rings[1],
    originalRing = original.slabs[0].polygon!.rings[1];
  expect(savedRing.map((v) => v.edgeId)).toEqual(
    originalRing.map((v) => v.edgeId),
  );
  expect(savedRing[0]).toMatchObject({ x: 1.25, supported: true });
  await button("Desfazer").click();
  await selectSlab();
  await page.getByLabel("Contorno da laje").selectOption("1");
  await expect(page.getByLabel("X do vértice")).toHaveValue("1");
  await expect(page.getByLabel("Vínculo da borda")).toHaveValue("simple");
  await button("Refazer").click();
  const open = page.waitForEvent("filechooser");
  await button("Abrir projeto").click();
  await (
    await open
  ).setFiles({
    name: "poligonal.kstruct.json",
    mimeType: "application/json",
    buffer: Buffer.from(edited),
  });
  await expect(page.getByLabel("Pressão pZ")).toHaveValue("-5");
  await expect(drawing.locator(".slab-supported-edge")).toHaveCount(7);
  const reopen = page.waitForEvent("filechooser");
  await button("Abrir projeto").click();
  await (
    await reopen
  ).setFiles({
    name: "ensaio.kstruct.json",
    mimeType: "application/json",
    buffer: Buffer.from(before),
  });
  await expect(drawing.locator(".slab-supported-edge")).toHaveCount(6);
  // Compare the actual SVG hit region in a void, the reentrant cut and the material.
  const hits = await drawing.evaluate((svg) => {
    const outline = svg.querySelector(
      ".slab-plan path[fill-rule=evenodd]",
    ) as SVGPathElement;
    const coord = (axis: "x" | "y", v: number) =>
      Number(
        svg
          .querySelector(`line[data-axis="${axis}"][data-position="${v}"]`)!
          .getAttribute(`${axis}1`),
      );
    return [
      [1.5, 1],
      [5, 3],
      [3, 1],
    ].map(([x, y]) =>
      outline.isPointInFill(
        new DOMPoint(
          coord("x", 0) + ((coord("x", 4) - coord("x", 0)) * x) / 4,
          coord("y", 0) + ((coord("y", 4) - coord("y", 0)) * y) / 4,
        ),
      ),
    );
  });
  expect(hits).toEqual([false, false, true]);
  if (!executable) return;
  await page.evaluate(() => sessionStorage.setItem("slab-ipc", "enabled"));
  await page.reload();
  await button("Analisar").click();
  await page.waitForFunction(
    () =>
      (window as unknown as SlabTestWindow).finishSlabAnalysis !== undefined,
  );
  await page.evaluate(() =>
    (window as unknown as SlabTestWindow).finishSlabAnalysis!(),
  );
  await expect(
    page.getByRole("table", { name: "Flecha e momentos no ponto de consulta" }),
  ).toContainText("Centroide da área líquida");
  await expect(drawing.locator(".slab-map polygon")).toHaveCount(160);
  await expect(page.locator(".slab-equilibrium")).toContainText("-85");
});

test("KS-42 · configura, desfaz, reabre e compara duas malhas QDKT no mesmo ponto", async ({
  page,
}) => {
  test.setTimeout(60000);
  if (executable) await plateBridge(page);
  const project = slabBenchmarkProject();
  project.slabs[0].formulation = "qdkt";
  await page.goto("/");
  await openProjectInBrowser(
    page,
    "placa.kstruct.json",
    serializeProject(project),
  );
  const button = (name: string) =>
    page.getByRole("button", { name, exact: true });
  const editor = page.getByRole("dialog", { name: "Malha da laje" });
  const openMesh = async () => {
    await page
      .locator(".explorer")
      .getByRole("button", { name: "L1", exact: true })
      .click();
    await button("Configurar malha da laje").click();
  };
  await openMesh();
  const count = editor.getByLabel("Contagem da malha");
  await expect(count).toContainText("48 elementos");
  await editor.getByLabel("Geração da malha").selectOption("target");
  const target = editor.getByLabel("Tamanho-alvo global");
  await target.fill("0.000000001");
  await expect(editor.getByRole("alert")).toContainText("limite");
  await expect(button("Aplicar malha")).toBeDisabled();
  await button("Cancelar").click();
  await openMesh();
  await expect(editor.getByLabel("Geração da malha")).toHaveValue("legacy");
  await editor.getByLabel("Geração da malha").selectOption("target");
  await target.fill("0.5");
  await expect(count).toContainText("48 elementos · 63 nós · 0 inválidos");
  await button("Aplicar malha").click();
  await button("Desfazer").click();
  await openMesh();
  await expect(editor.getByLabel("Geração da malha")).toHaveValue("legacy");
  await button("Cancelar").click();
  await button("Refazer").click();
  const download = page.waitForEvent("download");
  await button("Salvar projeto").click();
  const saved = await readFile((await (await download).path())!, "utf8");
  expect(parseProject(saved).slabs[0].sizing).toEqual({
    target: 0.5,
    edges: [],
  });
  await openProjectInBrowser(page, "placa-refinada.kstruct.json", saved);
  await openMesh();
  await expect(target).toHaveValue(/0[,.]5/);
  await button("Cancelar").click();
  if (!executable) return;
  await page.evaluate(() => sessionStorage.setItem("slab-ipc", "enabled"));
  await page.reload();
  const solve = async () => {
    await button("Analisar").click();
    await page.waitForFunction(
      () => !!(window as unknown as SlabTestWindow).finishSlabAnalysis,
    );
    await page.evaluate(() =>
      (window as unknown as SlabTestWindow).finishSlabAnalysis!(),
    );
    await expect(button("Comparar malhas")).toBeEnabled();
  };
  await solve();
  await button("Comparar malhas").click();
  const compare = page.getByRole("dialog", { name: "Comparação de malhas" });
  const table = compare.getByRole("table", {
    name: "Resultados no mesmo ponto",
  });
  await compare.getByLabel("X da consulta").fill("2");
  await compare.getByLabel("Y da consulta").fill("1.5");
  await expect(table).toContainText("Atual · 48 elementos");
  await button("Guardar referência desta malha").click();
  await button("Fechar comparação").click();
  await openMesh();
  await target.fill("0.25");
  await expect(count).toContainText("192 elementos");
  await button("Aplicar malha").click();
  await expect(button("Comparar malhas")).toBeDisabled();
  await solve();
  await button("Comparar malhas").click();
  await expect(table).toContainText("Atual · 192 elementos");
  await expect(table).toContainText("Referência · 48 elementos");
  const uz = table.getByRole("row").filter({ hasText: "UZ" });
  await expect(uz.getByRole("cell").nth(1)).toHaveText(
    formatResult(-1.02991662),
  );
  await expect(uz.getByRole("cell").nth(2)).toHaveText(
    formatResult(-1.0266872),
  );
  await expect(table.getByRole("row")).toHaveCount(5);
  await compare.getByLabel("X da consulta").fill("40");
  await expect(compare.getByRole("alert")).toContainText("área de material");
  await expect(button("Guardar referência desta malha")).toBeDisabled();
  await button("Fechar comparação").click();
  await page
    .locator(".explorer")
    .getByRole("button", { name: "L1", exact: true })
    .click();
  const pressure = page.getByLabel("Pressão pZ");
  await pressure.fill("-4");
  await pressure.press("Enter");
  await solve();
  await button("Comparar malhas").click();
  await expect(table).toContainText("Atual · 192 elementos");
  await expect(
    table.getByRole("columnheader", { name: /Referência/ }),
  ).toHaveCount(0);
});

test("KS-42 · refina a abertura e o apoio e localiza o elemento com alerta na prévia", async ({
  page,
}) => {
  const p = createProject("spatial"),
    ring = (xy: number[][], supported: boolean) =>
      newSlabRing(
        xy.map(([x, y]) => ({ x, y })),
        supported,
      );
  const slab = addPolygonSlab(p, "level1", [
    ring(
      [
        [0, 0],
        [6, 0],
        [6, 2],
        [3, 2],
        [3, 4],
        [0, 4],
      ],
      true,
    ),
    ring(
      [
        [1, 0.5],
        [2, 0.5],
        [2, 1.5],
        [1, 1.5],
      ],
      false,
    ),
  ]);
  await page.goto("/");
  await openProjectInBrowser(page, "painel.kstruct.json", serializeProject(p));
  await page.getByRole("button", { name: "Configurar malha da laje" }).click();
  const d = page.getByRole("dialog", { name: "Malha da laje" });
  await d.getByLabel("Geração da malha").selectOption("target");
  await d.getByLabel("Tamanho-alvo global").fill("1");
  const count = d.getByLabel("Contagem da malha");
  await expect(count).toContainText("160 elementos · 94 nós");
  for (const scope of ["ring:1", "edge:" + slab.polygon.rings[0][1].edgeId]) {
    await d.getByLabel("Refinar junto a").selectOption(scope);
    await d.getByLabel("Tamanho local").fill("0.25");
    await d
      .getByRole("button", { name: "Adicionar controle à prévia" })
      .click();
  }
  await expect(count).toContainText("484 elementos · 271 nós · 0 inválidos");
  const select = d.getByLabel("Ocorrências de qualidade");
  await select.selectOption({ index: 1 });
  const id = await select.inputValue();
  await expect(d.locator('polygon[data-picked="true"]')).toHaveAttribute(
    "data-element",
    id,
  );
  await expect(
    d.getByText(new RegExp("Elemento " + id + " · X ")),
  ).toBeVisible();
  await d.getByRole("button", { name: "Aplicar malha" }).click();
  const save = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Salvar projeto", exact: true })
    .click();
  const saved = parseProject(
    await readFile((await (await save).path())!, "utf8"),
  );
  expect(saved.slabs[0].sizing?.edges.map((e) => e.edgeId).sort()).toEqual(
    [slab.polygon.rings[0][1], ...slab.polygon.rings[1]]
      .map((v) => v.edgeId)
      .sort(),
  );
  slab.polygon.rings = [
    ring(
      [
        [0, 0],
        [1e10, 0],
        [0, 0.1],
      ],
      true,
    ),
  ];
  await openProjectInBrowser(
    page,
    "degenerada.kstruct.json",
    serializeProject(p),
  );
  await page.getByRole("button", { name: "Configurar malha da laje" }).click();
  await expect(count).toContainText(/\b[1-9]\d* inválidos/);
  await expect(d.getByRole("button", { name: "Aplicar malha" })).toBeDisabled();
  await d.getByLabel("Ocorrências de qualidade").selectOption({ index: 1 });
  await expect(d.locator('polygon[data-picked="true"]')).toHaveAttribute(
    "data-quality",
    "invalid",
  );
  await d.getByRole("button", { name: "Cancelar" }).click();
  await page.getByRole("button", { name: "Análise", exact: true }).click();
  await page
    .getByRole("button", { name: "Entrada OOFEM", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    /Malha inválida.*elemento/,
  );
});

test("KS-43 · lança a segunda laje, conecta a viga e compara os três vínculos pelo editor", async ({
  page,
}) => {
  test.setTimeout(90000);
  if (executable) await plateBridge(page);
  const p = jointedSlabs(6);
  p.slabs.pop();
  delete p.slabJoint;
  await page.goto("/");
  await openProjectInBrowser(
    page,
    "primeira-laje-e-viga.kstruct.json",
    serializeProject(p),
  );
  const button = (name: string) =>
    page.getByRole("button", { name, exact: true });
  const drawing = page.getByRole("application", {
    name: "Área de lançamento XY",
  });
  await page.getByRole("button", { name: /^Laje L$/ }).click();
  const positions = await drawing.evaluate((svg) => {
    const g = (axis: string, v: number) =>
      Number(
        svg
          .querySelector(`line[data-axis="${axis}"][data-position="${v}"]`)!
          .getAttribute(axis + "1"),
      );
    return [
      { x: g("x", 4), y: g("y", 0) },
      { x: g("x", 8), y: g("y", 0) + (g("y", 4) - g("y", 0)) * 0.75 },
    ];
  });
  for (const position of positions) await drawing.click({ position });
  await expect(page.locator(".model-count")).toContainText("2 lajes");
  const label = page.getByLabel("Legenda da borda comum");
  await expect(label).toContainText("L1 ↔ L2 · Articulada");
  const d = page.getByRole("dialog", { name: "Vínculo entre lajes" });
  await drawing.getByRole("button", { name: /Borda L1 ↔ L2/ }).focus();
  await page.keyboard.press("Enter");
  await expect(d).toContainText("3 m");
  await d.getByLabel("Apoio da borda comum").selectOption(p.members[0].id);
  await d.getByLabel("Ligação à flexão").selectOption("elastic");
  await expect(
    d.getByRole("button", { name: "Aplicar vínculo" }),
  ).toBeDisabled();
  await d.getByLabel("Rigidez rotacional por comprimento").fill("1000");
  await d.getByRole("button", { name: "Aplicar vínculo" }).click();
  await expect(label).toContainText("1000 kN·m/(rad·m)");
  await button("Desfazer").click();
  await expect(label).toContainText("L1 ↔ L2 · Articulada");
  await button("Refazer").click();
  // Editing pressure on the second slab must preserve the first pattern entry.
  await page
    .locator(".explorer")
    .getByRole("button", { name: "L2", exact: true })
    .click();
  const pressure = page.getByLabel("Pressão pZ");
  await pressure.fill("-1");
  await pressure.press("Enter");
  await page
    .locator(".explorer")
    .getByRole("button", { name: "L1", exact: true })
    .click();
  await expect(pressure).toHaveValue("-5");
  await page
    .locator(".explorer")
    .getByRole("button", { name: "L2", exact: true })
    .click();
  await pressure.fill("0");
  await pressure.press("Enter");
  const save = page.waitForEvent("download");
  await button("Salvar projeto").click();
  const json = await readFile((await (await save).path())!, "utf8");
  const saved = parseProject(json);
  expect(saved.slabJoint).toMatchObject({
    kind: "elastic",
    support: "beam",
    memberId: p.members[0].id,
    stiffness: 1e6,
  });
  expect(saved.loadPatterns[0].pressure).toEqual(p.loadPatterns[0].pressure);
  await openProjectInBrowser(page, "pavimento.kstruct.json", json);
  await expect(label).toContainText("Semirrígida");
  await expect(drawing.locator(".slab-joint-plan")).toHaveAttribute(
    "data-kind",
    "elastic",
  );
  if (!executable) return;
  await page.evaluate(() => sessionStorage.setItem("slab-ipc", "enabled"));
  await page.reload();
  const table = page.getByRole("table", {
    name: "Transferência na borda comum",
  });
  const solve = async () => {
    await button("Analisar").click();
    await page.waitForFunction(
      () => !!(window as unknown as SlabTestWindow).finishSlabAnalysis,
    );
    await page.evaluate(() =>
      (window as unknown as SlabTestWindow).finishSlabAnalysis!(),
    );
    await expect(table).toBeVisible();
  };
  const values: Record<string, number> = {};
  for (const kind of ["elastic", "hinged", "continuous"] as const) {
    if (kind !== "elastic") {
      await drawing.getByRole("button", { name: /Borda L1 ↔ L2/ }).focus();
      await page.keyboard.press("Enter");
      await d.getByLabel("Ligação à flexão").selectOption(kind);
      await d.getByRole("button", { name: "Aplicar vínculo" }).click();
      await expect(table).toHaveCount(0);
    }
    await solve();
    const input = structuredClone(saved);
    input.slabJoint!.kind = kind;
    if (kind !== "elastic") delete input.slabJoint!.stiffness;
    const deck = exportOofem(input, "EL"),
      actual = parseOofemOutput(runDeck(deck.deck, executable), deck).floor!;
    const cells = table.getByRole("cell");
    await expect(cells.nth(0)).toHaveText(formatResult(actual.momentA / 1000));
    await expect(cells.nth(3)).toHaveText(
      formatResult(actual.beamForce / 1000),
    );
    values[kind] = Math.abs(actual.momentA);
    await page
      .locator(".explorer")
      .getByRole("button", { name: "L2", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Resultados da laje" }),
    ).toContainText("Laje L2");
    await expect(
      drawing.getByLabel("Mapa de Flecha UZ da laje L2", { exact: false }),
    ).toHaveCount(1);
  }
  expect(values.hinged).toBeLessThan(values.elastic);
  expect(values.elastic).toBeLessThan(values.continuous);
});
test("lança painéis espaciais, salva, reabre e verifica a parede sob a laje em balanço", async ({
  page,
}) => {
  test.setTimeout(90000);
  if (executable) await plateBridge(page);
  const legacy = JSON.stringify({
    ...createProject(),
    schemaVersion: 27,
    name: "Rascunho v27",
  });
  await page.addInitScript((source) => {
    if (!localStorage.getItem("kstruct.draft.v27"))
      localStorage.setItem("kstruct.draft.v27", source);
  }, legacy);
  await page.goto("/");
  await expect(
    page.getByRole("textbox", { name: "Nome do projeto" }),
  ).toHaveValue("Rascunho v27");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("kstruct.draft.v32") ?? "{}")
            .schemaVersion,
      ),
    )
    .toBe(32);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("kstruct.draft.v27")!).schemaVersion,
    ),
  ).toBe(27);
  const button = (name: string) =>
    page.getByRole("button", { name, exact: true });
  await button("Novo pórtico espacial").click();
  const dialog = page.getByRole("dialog", { name: "Painel espacial" });
  await button("Novo painel espacial").click();
  await dialog.getByLabel("Nome do painel").fill("Parede");
  await dialog.getByLabel("D · Y").fill("1,2");
  await dialog.getByLabel("Espessura (cm)").fill("10");
  await dialog.getByLabel("Subdivisões AD").fill("4");
  await dialog.getByRole("button", { name: "Aplicar painel" }).click();
  await button("Novo painel espacial").click();
  await dialog.getByLabel("Nome do painel").fill("Laje em balanço");
  await dialog.getByLabel("q3 local (kN/m)").fill("-1");
  await dialog.getByRole("button", { name: "Aplicar painel" }).click();
  const editSlab = button("Laje em balanço · Casca");
  await expect(editSlab).toBeVisible();
  await button("Desfazer").click();
  await expect(editSlab).toHaveCount(0);
  await button("Refazer").click();
  await expect(editSlab).toBeVisible();
  const save = page.waitForEvent("download");
  await button("Salvar projeto").click();
  const text = await readFile((await (await save).path())!, "utf8");
  const model = parseProject(text);
  expect(model.surfacePanels).toHaveLength(2);
  expect(model.loadPatterns[0].panelActions![0].traction.z).toBe(-1000);
  await openProjectInBrowser(page, "parede-laje.kstruct.json", text);
  await editSlab.click();
  await expect(dialog.getByLabel("A · Z")).toHaveValue("3");
  await expect(dialog.getByLabel("q3 local (kN/m)")).toHaveValue("-1");
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await button("Análise").click();
  const download = page.waitForEvent("download");
  await button("Entrada OOFEM").click();
  expect(await readFile((await (await download).path())!, "utf8")).toBe(
    exportOofem(model, "EL").deck,
  );
  if (!executable) return;
  await page.evaluate(() => sessionStorage.setItem("slab-ipc", "enabled"));
  await page.reload();
  await button("Analisar").click();
  await page.waitForFunction(
    () => !!(window as unknown as SlabTestWindow).finishSlabAnalysis,
  );
  await page.evaluate(() =>
    (window as unknown as SlabTestWindow).finishSlabAnalysis!(),
  );
  const results = page.getByRole("region", {
    name: "Resultados dos painéis espaciais",
  });
  await expect(
    results.getByRole("table", { name: "Extremos locais do painel" }),
  ).toBeVisible();
  await results
    .getByLabel("Painel consultado")
    .selectOption(model.surfacePanels![1].id);
  await expect(results).toContainText("5 nós de malha compartilhados");
  await expect(results).toContainText("M11");
  await editSlab.click();
  await dialog.getByLabel("q3 local (kN/m)").fill("-2");
  await dialog.getByRole("button", { name: "Aplicar painel" }).click();
  await expect(results.getByRole("table")).toHaveCount(0);
});

test("KS-45 · gira a cobertura, reabre o modelo e consulta os dois referenciais", async ({
  page,
}) => {
  test.setTimeout(90_000);
  if (executable) await plateBridge(page);
  await page.goto("/");
  const original = await readFile(
    "examples/cobertura-direcional.kstruct.json",
    "utf8",
  );
  await openProjectInBrowser(page, "cobertura.kstruct.json", original);
  const button = (name: string) =>
    page.getByRole("button", { name, exact: true });
  const edit = button("Cobertura · Casca");
  const dialog = page.getByRole("dialog", { name: "Painel espacial" });
  const angle = dialog.getByLabel("Ângulo dos eixos resistentes (°)");
  const m11 = dialog.getByLabel("Fator M11");
  const apply = dialog.getByRole("button", { name: "Aplicar painel" });
  await edit.click();
  await expect(angle).toHaveValue("0");
  await expect(m11).toHaveValue("4");
  await expect(dialog.getByLabel("Fator N11")).toHaveValue("1");
  await m11.fill("0");
  await apply.click();
  await expect(dialog.getByRole("alert")).toContainText("M11");
  await m11.fill("4");
  await dialog.getByLabel("Formulação").selectOption("plate");
  await expect(dialog.getByLabel("Fator N11")).toHaveCount(0);
  await dialog.getByLabel("Formulação").selectOption("shell");
  await dialog.getByLabel("Subdivisões AB").fill("16");
  await dialog.getByLabel("Subdivisões AD").fill("8");
  await angle.fill("90,0");
  await apply.click();
  await button("Desfazer").click();
  await edit.click();
  await expect(angle).toHaveValue("0");
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await button("Refazer").click();

  const download = page.waitForEvent("download");
  await button("Salvar projeto").click();
  const saved = await readFile((await (await download).path())!, "utf8");
  const model = parseProject(saved);
  expect(model.surfacePanels![0]).toMatchObject({
    angleDeg: 90,
    stiffness: { m11: 4 },
  });
  expect(model.loadPatterns).toEqual(parseProject(original).loadPatterns);
  await openProjectInBrowser(page, "cobertura-90.kstruct.json", saved);
  await button("Exibição").click();
  await page.getByLabel("Arranjo de vistas").selectOption("dual");
  const faces = button("Eixos e faces dos painéis");
  const plus = page.getByLabel("Cobertura · Face +3", { exact: true });
  const minus = page.getByLabel("Cobertura · Face −3", { exact: true });
  await expect(plus).toHaveCount(1);
  await expect(minus).toHaveCount(1);
  await faces.click();
  await expect(plus).toHaveCount(0);
  await expect(minus).toHaveCount(0);
  await faces.click();
  await expect(plus).toHaveCount(1);
  await button("Análise").click();
  const input = page.waitForEvent("download");
  await button("Entrada OOFEM").click();
  expect(await readFile((await (await input).path())!, "utf8")).toBe(
    exportOofem(model, "EL").deck,
  );
  if (!executable) return;
  await page.evaluate(() => sessionStorage.setItem("slab-ipc", "enabled"));
  await page.reload();
  const table = page.getByRole("table", { name: "Extremos locais do painel" });
  async function solve() {
    await button("Analisar").click();
    await page.waitForFunction(
      () => !!(window as unknown as SlabTestWindow).finishSlabAnalysis,
    );
    await page.evaluate(() =>
      (window as unknown as SlabTestWindow).finishSlabAnalysis!(),
    );
    await expect(table).toBeVisible();
  }
  const extreme = (name: string) =>
    table
      .getByRole("cell", { name, exact: true })
      .locator("..")
      .getByRole("cell")
      .nth(1);
  await solve();
  const materialMoment = await extreme("M11").innerText();
  const frame = page.getByLabel("Referencial do painel");
  await expect(frame).toHaveValue("resistant");
  await frame.selectOption("geometric");
  await expect(extreme("M22")).toHaveText(materialMoment);
  await expect(extreme("M11")).not.toHaveText(materialMoment);
  const deflection = async () =>
    Math.abs(Number((await extreme("U3").innerText()).replace(",", ".")));
  const deflection90 = await deflection();
  expect(deflection90).toBeCloseTo(0.0613, 3);
  await edit.click();
  await angle.fill("0");
  await apply.click();
  await expect(table).toHaveCount(0);
  await solve();
  expect(await deflection()).toBeCloseTo(0.2034, 3);
});

test("KS-46 · aplica pressão por cota e por vértice à parede e confere a reação na base", async ({
  page,
}) => {
  test.setTimeout(75_000);
  if (executable) await plateBridge(page);
  await page.goto("/");
  const source = await readFile(
    "examples/parede-pressao-hidrostatica.kstruct.json",
    "utf8",
  );
  await openProjectInBrowser(page, "parede.kstruct.json", source);
  const button = (name: string) =>
    page.getByRole("button", { name, exact: true });
  const edit = button("Parede do reservatório · Casca");
  const dlg = page.getByRole("dialog", { name: "Painel espacial" });
  await edit.click();
  await expect(dlg.getByLabel("Distribuição da carga")).toHaveValue(
    "elevation",
  );
  await expect(dlg.getByLabel("Pressão na cota inferior (kN/m²)")).toHaveValue(
    "39.24",
  );
  await dlg.getByLabel("Cota Z superior (m)").fill("0");
  await dlg.getByRole("button", { name: "Aplicar painel" }).click();
  await expect(dlg.getByRole("alert")).toContainText("superior");
  await dlg.getByLabel("Cota Z superior (m)").fill("4");
  await dlg.getByLabel("Distribuição da carga").selectOption("vertices");
  await dlg.getByLabel("Direção da carga").selectOption("X");
  for (const corner of ["A", "D"])
    await dlg.getByLabel(corner + " (kN/m²)", { exact: true }).fill("-39,24");
  await dlg.getByRole("button", { name: "Aplicar painel" }).click();
  await expect(dlg).toHaveCount(0);
  await expect(
    page.getByRole("img", {
      name: "Parede do reservatório · carga superficial",
    }),
  ).toBeVisible();
  const loads3d = page
    .getByRole("region", { name: "Perspectiva 3D" })
    .getByRole("button", { name: "Cargas", exact: true });
  if ((await loads3d.getAttribute("aria-pressed")) === "false")
    await loads3d.click();
  await expect(
    page.locator(".scene-label").filter({ hasText: /X global.*kN\/m²/ }),
  ).toHaveCount(1);
  await button("Desfazer").click();
  await edit.click();
  await expect(dlg.getByLabel("Distribuição da carga")).toHaveValue(
    "elevation",
  );
  await dlg.getByRole("button", { name: "Cancelar" }).click();
  await button("Refazer").click();
  const download = page.waitForEvent("download");
  await button("Salvar projeto").click();
  const saved = await readFile((await (await download).path())!, "utf8");
  const p = parseProject(saved);
  expect(p.loadPatterns[0].panelActions![0]).toMatchObject({
    pressure: 0,
    direction: "X",
    distribution: {
      mode: "vertices",
      values: { A: -39240, B: 0, C: 0, D: -39240 },
    },
  });
  await openProjectInBrowser(page, "parede-vertices.kstruct.json", saved);
  await button("Análise").click();
  const output = page.waitForEvent("download");
  await button("Entrada OOFEM").click();
  expect(await readFile((await (await output).path())!, "utf8")).toBe(
    exportOofem(p, "EL").deck,
  );
  if (!executable) return;
  await page.evaluate(() => sessionStorage.setItem("slab-ipc", "enabled"));
  await page.reload();
  await button("Analisar").click();
  await page.waitForFunction(
    () => !!(window as unknown as SlabTestWindow).finishSlabAnalysis,
  );
  await page.evaluate(() =>
    (window as unknown as SlabTestWindow).finishSlabAnalysis!(),
  );
  const results = page.getByRole("region", {
    name: "Resultados dos painéis espaciais",
  });
  await expect(results).toContainText(/Força aplicada em XYZ.*-235[,.]44/);
  await expect(results).toContainText(/Momento dos apoios em XYZ.*313[,.]92/);
  await edit.click();
  await dlg.getByLabel("A (kN/m²)", { exact: true }).fill("-30");
  await dlg.getByRole("button", { name: "Aplicar painel" }).click();
  await expect(results.getByRole("table")).toHaveCount(0);
});

test("KS-46 · configura as quatro pressões de uma laje em planta e recupera a carga uniforme ao desfazer", async ({
  page,
}) => {
  await page.goto("/");
  const p = slabBenchmarkProject();
  await openProjectInBrowser(page, "laje.kstruct.json", serializeProject(p));
  await page.getByLabel("Pavimento ativo").selectOption("level1");
  await page
    .locator(".explorer")
    .getByRole("button", { name: p.slabs[0].name, exact: true })
    .click();
  await page
    .getByRole("button", { name: "Configurar carga superficial" })
    .click();
  const dlg = page.getByRole("dialog", { name: "Carga superficial da laje" });
  await dlg.getByLabel("Distribuição da carga").selectOption("vertices");
  await dlg.getByLabel("A (kN/m²)", { exact: true }).fill("3");
  await dlg.getByRole("button", { name: "Aplicar carga superficial" }).click();
  await expect(
    page.getByRole("img", { name: p.slabs[0].name + " · carga superficial" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await page
    .locator(".explorer")
    .getByRole("button", { name: p.slabs[0].name, exact: true })
    .click();
  await expect(page.getByLabel("Pressão pZ", { exact: true })).toHaveValue(
    "-5",
  );
});

test("KS-47 · lança o painel de carga, confere as parcelas, reabre e analisa o pórtico", async ({
  page,
}) => {
  test.setTimeout(75_000);
  if (executable) await plateBridge(page);
  await page.goto("/");
  const p = parseProject(
    await readFile("examples/portico-painel-de-carga.kstruct.json", "utf8"),
  );
  delete p.loadPanels;
  delete p.loadPatterns[0].tributaryLoads;
  await openProjectInBrowser(page, "portico.kstruct.json", serializeProject(p));
  await page.getByLabel("Pavimento ativo").selectOption("level1");
  const button = (name: string) =>
    page.getByRole("button", { name, exact: true });
  await button("Novo painel de carga").click();
  const dialog = page.getByRole("dialog", { name: "Painel de carga" });
  for (const corner of ["A", "B", "D"])
    await dialog
      .getByLabel("Nó " + corner, { exact: true })
      .selectOption(corner);
  const distribution = dialog.getByLabel("Distribuição às vigas");
  await distribution.selectOption("twoWay");
  await dialog.getByLabel("Intensidade (kN/m²)").fill("-5,0");
  const table = dialog.getByRole("table", { name: "Parcelas por viga" });
  const cells = (name: string) =>
    table
      .getByRole("row")
      .filter({ has: page.getByRole("cell", { name, exact: true }) })
      .getByRole("cell");
  await expect(cells("V1").nth(2)).toHaveText("8");
  await expect(cells("V1").nth(3)).toHaveText(/-40(?:[.,]0+)?$/);
  await expect(cells("V2").nth(3)).toHaveText(/-20(?:[.,]0+)?$/);
  await expect(
    dialog.getByRole("region", { name: "Distribuição do painel" }),
  ).toContainText(/Força em Z -120/);
  await dialog.getByText("Cargas lineares por trecho").click();
  await expect(
    dialog
      .getByRole("table", { name: "Cargas lineares nas vigas" })
      .getByRole("row"),
  ).toHaveCount(11);
  const apply = dialog.getByRole("button", { name: "Aplicar painel de carga" });
  await apply.click();
  const edit = button("PC1 · Painel de carga");
  await expect(edit).toBeVisible();
  const drawing = page.getByRole("application", {
    name: "Área de lançamento XY",
  });
  const region = drawing.getByRole("img", {
    name: "Áreas de influência de PC1",
  });
  await expect(region.locator("polygon")).toHaveCount(4);
  await button("Novo painel de carga").click();
  await expect(dialog.getByRole("alert")).toContainText("se sobrepõe");
  await expect(apply).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await edit.click();
  await distribution.selectOption("spanAD");
  await expect(table.getByRole("row")).toHaveCount(3);
  await expect(cells("V1").nth(3)).toHaveText(/-60(?:[.,]0+)?$/);
  await apply.click();
  await expect(region.locator("polygon")).toHaveCount(2);
  await button("Desfazer").click();
  await expect(region.locator("polygon")).toHaveCount(4);
  await button("Refazer").click();
  await expect(region.locator("polygon")).toHaveCount(2);
  const download = page.waitForEvent("download");
  await button("Salvar projeto").click();
  const saved = await readFile((await (await download).path())!, "utf8");
  const model = parseProject(saved);
  expect(model.loadPanels).toHaveLength(1);
  expect(model.loadPanels![0].distribution).toBe("spanAD");
  expect(model.loadPatterns[0].tributaryLoads).toEqual([
    { panelId: model.loadPanels![0].id, axis: "Z", pressure: -5000 },
  ]);
  expect(model.loadPatterns[0].distributed ?? []).toEqual([]);
  await openProjectInBrowser(page, "portico-com-painel.kstruct.json", saved);
  await edit.click();
  await expect(distribution).toHaveValue("spanAD");
  await expect(dialog.getByLabel("Intensidade (kN/m²)")).toHaveValue("-5");
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await button("Análise").click();
  const output = page.waitForEvent("download");
  await button("Entrada OOFEM").click();
  expect(await readFile((await (await output).path())!, "utf8")).toBe(
    exportOofem(model, "EL").deck,
  );
  if (!executable) return;
  await page.evaluate(() => sessionStorage.setItem("slab-ipc", "enabled"));
  await page.reload();
  await button("Analisar").click();
  await page.waitForFunction(
    () => !!(window as unknown as SlabTestWindow).finishSlabAnalysis,
  );
  await page.evaluate(() =>
    (window as unknown as SlabTestWindow).finishSlabAnalysis!(),
  );
  await expect(page.getByRole("status")).toContainText(
    "Equilíbrio global verificado",
  );
  await expect(page.getByLabel("Visualização dos resultados")).toHaveValue(
    "deformed",
  );
});

test("KS-49 · compara casos e malhas com uma legenda no mesmo ponto", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const project = slabBenchmarkProject();
  Object.assign(project.slabs[0], {
    formulation: "qdkt",
    divisionsX: 8,
    divisionsY: 6,
  });
  project.analysisCases.push({
    ...project.analysisCases[0],
    id: "P2",
    name: "Pressão dobrada",
    factors: [{ patternId: "G", factor: 2 }],
  });
  if (executable) await plateBridge(page);
  await page.goto("/");
  await openProjectInBrowser(
    page,
    "comparacao.kstruct.json",
    serializeProject(project),
  );
  const button = (name: string) =>
    page.getByRole("button", { name, exact: true });
  const open = () => button("Comparar mapas de áreas").click();
  const close = () => button("Fechar comparação de mapas").click();
  const dialog = page.getByRole("dialog", {
    name: "Comparação de mapas de áreas",
  });
  const a = dialog.getByRole("region", { name: "Mapa A", exact: true });
  const b = dialog.getByRole("region", { name: "Mapa B", exact: true });
  const legend = dialog.getByLabel("Legenda comum");
  const probe = async () => {
    await dialog.getByLabel("X local da comparação").fill("1,875");
    await dialog.getByLabel("Y local da comparação").fill("1,375");
  };
  const read = (side: typeof a) =>
    side.getByRole("row").nth(1).getByRole("cell").nth(2);
  await open();
  await expect(a).toContainText("Resultado indisponível");
  await expect(b).toContainText("Pressão dobrada · Resultado indisponível");
  await close();
  if (!executable) return;

  await page.evaluate(() => sessionStorage.setItem("slab-ipc", "enabled"));
  await page.reload();
  const solve = async (caseId: string) => {
    await page.getByLabel("Caso estático").selectOption(caseId);
    await button("Analisar").click();
    await page.waitForFunction(
      () => !!(window as unknown as SlabTestWindow).finishSlabAnalysis,
    );
    await page.evaluate(() =>
      (window as unknown as SlabTestWindow).finishSlabAnalysis!(),
    );
    await expect(button("Analisar")).toBeEnabled();
  };
  await solve("EL");
  await open();
  await probe();
  await expect(a.getByRole("img")).toBeVisible();
  await expect(b).toContainText("Resultado indisponível");
  await close();

  await solve("P2");
  await open();
  await dialog.getByLabel("Resultado A").selectOption("EL");
  await dialog.getByLabel("Resultado B").selectOption("P2");
  await probe();
  await expect(legend).toContainText("Escala automática");
  await dialog.getByLabel("Mínimo (mm)").fill("-3");
  await dialog.getByLabel("Máximo (mm)").fill("0");
  await button("Fixar limites").click();
  await expect(legend).toContainText("Escala fixada");
  const v = async (side: typeof a) =>
    Number((await read(side).innerText()).replace(" mm", "").replace(",", "."));
  expect(await v(b)).toBeCloseTo(2 * (await v(a)), 4);
  await dialog.getByLabel("Resultado B").selectOption("EL");
  await expect(read(b)).toHaveText(await read(a).innerText());
  expect(await read(b).locator("i").getAttribute("style")).toBe(
    await read(a).locator("i").getAttribute("style"),
  );
  await button("Guardar malha do mapa A").click();
  await close();

  await page
    .locator(".explorer")
    .getByRole("button", { name: "L1", exact: true })
    .click();
  await button("Configurar malha da laje").click();
  const mesh = page.getByRole("dialog", { name: "Malha da laje" });
  await mesh.getByLabel("Geração da malha").selectOption("target");
  await mesh.getByLabel("Tamanho-alvo global").fill("0.25");
  await button("Aplicar malha").click();
  await open();
  await expect(a).toContainText("48 elementos");
  await expect(b).toContainText("Resultado indisponível");
  await close();
  await solve("EL");
  await open();
  await probe();
  await expect(a).toContainText("48 elementos");
  await expect(b).toContainText("192 elementos");
  await expect(
    a.getByRole("row").nth(1).getByRole("cell").nth(1),
  ).not.toHaveText(
    await b.getByRole("row").nth(1).getByRole("cell").nth(1).innerText(),
  );
  await close();

  await button("Exibição").click();
  await button("Unidades").click();
  const units = page.getByRole("dialog", { name: "Unidades", exact: true });
  await units
    .getByRole("combobox", { name: "Deslocamentos", exact: true })
    .selectOption("cm");
  await button("Aplicar unidades").click();
  await open();
  await probe();
  await expect(legend).toContainText("Flecha UZ (cm)");
  await expect(read(a)).toContainText("cm");
  await close();

  const pressure = page.getByLabel("Pressão pZ");
  await pressure.fill("-4");
  await pressure.press("Enter");
  await open();
  await expect(
    dialog.getByRole("option", { name: /Malha guardada/ }),
  ).toHaveCount(0);
  await expect(a).toContainText("Resultado indisponível");
});

test("KS-49 · identifica as leituras de cada painel na dobra", async ({
  page,
}) => {
  test.skip(!executable, "Configure OOFEM_BIN para analisar os painéis.");
  test.setTimeout(90_000);
  const project = foldedPanels();
  await plateBridge(page);
  await page.goto("/");
  await openProjectInBrowser(
    page,
    "dobra.kstruct.json",
    serializeProject(project),
  );
  await page.evaluate(() => sessionStorage.setItem("slab-ipc", "enabled"));
  await page.reload();
  await page.getByRole("button", { name: "Analisar", exact: true }).click();
  await page.waitForFunction(
    () => !!(window as unknown as SlabTestWindow).finishSlabAnalysis,
    undefined,
    { timeout: 10000 },
  );
  await page.evaluate(() =>
    (window as unknown as SlabTestWindow).finishSlabAnalysis!(),
  );
  await expect(
    page.getByRole("table", { name: "Extremos locais do painel" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Comparar mapas de áreas", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Comparação de mapas de áreas",
  });
  await dialog.getByLabel("Componente").selectOption("mxx");
  await dialog.getByLabel("Recuperação").selectOption("element");
  await dialog.getByLabel("X local da comparação").fill("3");
  await dialog.getByLabel("Y local da comparação").fill("0,6");
  const table = dialog.getByRole("table", { name: "Leitura no mapa A" });
  await expect(table).toContainText("Parede");
  await expect(table).toContainText("Laje · referencial próprio");
  await dialog.getByLabel("X local da comparação").fill("2,8");
  await expect(table).not.toContainText("Laje · referencial próprio");
});
