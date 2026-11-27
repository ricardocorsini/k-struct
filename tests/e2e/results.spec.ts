import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import {
  beamExample,
  parseProject,
  serializeProject,
} from "../../src/domain/model";
import { runDeck } from "../fixtures/solve-oofem";
import { openProjectInBrowser } from "../fixtures/open-project";
import { familyBeam } from "../fixtures/combination-families";
import { pointLoadBeam } from "../fixtures/member-point-loads";
import { diagramEnvelope } from "../fixtures/diagram-envelope";
import { twoSpanBeam } from "../fixtures/two-span-beam";
import {
  planarNodalEnvelope,
  spatialNodalEnvelope,
} from "../fixtures/nodal-envelopes";

// Only the IPC boundary is substituted. This is a captured result from the real
// OOFEM benchmark, not an alternative solver or a fallback in the application.
const output = readFileSync(
  new URL("../fixtures/beam-oofem.txt", import.meta.url),
  "utf8",
);
async function bridge(
  page: Page,
  { delayed = false, solverOutput = output, realSolver = false } = {},
) {
  await page.addInitScript(
    ({ output, delayed, realSolver }) => {
      type InvokeArgs = {
        runContext: { runId: string; projectName: string; caseName: string };
        runId: string;
        deck: string;
        response: { onmessage: (outcome: unknown) => void };
      };
      const w = window as unknown as {
        isTauri: boolean;
        __TAURI_INTERNALS__: {
          invoke: (cmd: string, args: InvokeArgs) => Promise<unknown>;
          transformCallback: () => number;
        };
        finishAnalysis?: (options?: {
          fail?: boolean;
          cancelNext?: boolean;
        }) => void;
        solveQueueDeck: (deck: string) => Promise<string>;
      };
      const engine = {
        origin: "bundled",
        path: "/kstruct/oofem/oofem",
        version: "3.0",
        commit: "214b161",
        sha256: "checksum",
      };
      let callbackId = 0;
      let pending: {
        runId: string;
        finish: (cancelled: boolean) => void;
      } | null = null;
      const records = () =>
        JSON.parse(sessionStorage.getItem("e2e-native-runs") ?? "[]") as Array<{
          summary: { runId: string };
          stdout: string;
        }>;
      w.isTauri = true;
      w.__TAURI_INTERNALS__ = {
        transformCallback: () => ++callbackId,
        invoke: async (cmd, args) => {
          if (cmd === "start_oofem") {
            const starts = JSON.parse(
              sessionStorage.getItem("e2e-case-starts") ?? "[]",
            );
            sessionStorage.setItem(
              "e2e-case-starts",
              JSON.stringify([...starts, args.runContext.caseName]),
            );
            const finish = (
              cancelled: boolean,
              failed = false,
              result = output,
            ) => {
              const log = {
                summary: {
                  ...args.runContext,
                  startedAt: Date.now(),
                  durationMs: 123,
                  engine,
                  status: cancelled
                    ? "cancelled"
                    : failed
                      ? "failed"
                      : "completed",
                  message: cancelled
                    ? "Análise cancelada."
                    : failed
                      ? "Falha controlada no motor."
                      : "Execução do OOFEM concluída.",
                },
                stdout: "Saída do OOFEM para a viga de referência",
                stderr: "",
                logTruncated: false,
              };
              sessionStorage.setItem(
                "e2e-native-runs",
                JSON.stringify([log, ...records()]),
              );
              pending = null;
              args.response.onmessage({
                output: cancelled || failed ? null : result,
                log,
                historyError: null,
              });
            };
            if (delayed) {
              pending = { runId: args.runContext.runId, finish };
              w.finishAnalysis = (options) => {
                if (options?.cancelNext)
                  setTimeout(() =>
                    document
                      .querySelector<HTMLButtonElement>(
                        '[aria-label="Cancelar análise"]',
                      )
                      ?.click(),
                  );
                finish(false, options?.fail);
              };
            } else
              finish(
                false,
                false,
                realSolver ? await w.solveQueueDeck(args.deck) : output,
              );
            return;
          }
          if (cmd === "cancel_oofem" && pending?.runId === args.runId) {
            const { finish } = pending;
            setTimeout(() => finish(true), 80);
            return true;
          }
          if (cmd === "list_oofem_runs")
            return records().map((log) => log.summary);
          if (cmd === "read_oofem_log")
            return records().find((log) => log.summary.runId === args.runId);
          if (cmd === "diagnose_oofem")
            return {
              ok: true,
              message: "A viga de referência reproduziu os valores esperados.",
              engine,
              benchmark: {
                leftReactionN: 30000,
                rightReactionN: 30000,
                midspanUzM: -0.0084375,
              },
              stdout: "",
              stderr: "",
            };
          throw new Error(`Unexpected test IPC: ${cmd}`);
        },
      };
    },
    { output: solverOutput, delayed, realSolver },
  );
}

test("cancelar ou repetir um lote preserva as reações e o histórico", async ({
  page,
}) => {
  await bridge(page);
  await page.goto("/");
  const button = (name: string) =>
    page.getByRole("button", { name, exact: true });
  await page.getByRole("button", { name: /Viga de referência/ }).click();
  await button("Analisar").click();
  await expect(page.getByRole("status")).toContainText("Análise concluída");
  await button("Reações").click();
  const cells = page.getByRole("cell", { name: "30", exact: true });
  const explorer = page.locator(".explorer");
  await explorer.getByRole("button", { name: /^N1/ }).click();
  await explorer
    .getByRole("button", { name: /^N2/ })
    .click({ modifiers: ["Control"] });
  const batch = page.getByRole("region", { name: "Atribuição em lote" });
  await batch.getByLabel("Lote Força Z").fill("inválido");
  await expect(button("Aplicar lote")).toBeDisabled();
  await batch.getByRole("button", { name: "Cancelar" }).click();
  await expect(cells).toHaveCount(2);
  await batch.getByLabel("Apoio em lote uz").selectOption("restrict");
  await button("Aplicar lote").click();
  await expect(batch).toContainText("Nenhuma alteração efetiva");
  await expect(button("Desfazer")).toBeDisabled();
  await expect(cells).toHaveCount(2);
  await batch.getByLabel("Apoio em lote ry").selectOption("restrict");
  await button("Aplicar lote").click();
  await expect(button("Desfazer")).toBeEnabled();
  await expect(cells).toHaveCount(0);
});

test("resultados calculados são apresentados e invalidados após edição", async ({
  page,
}) => {
  await bridge(page);
  await page.goto("/");
  await page.getByRole("button", { name: /Viga de referência/ }).click();
  await page.getByRole("button", { name: "Analisar", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Análise concluída");
  await expect(page.getByLabel("Visualização dos resultados")).toHaveValue("m");
  await page.getByRole("button", { name: "Reações", exact: true }).click();
  await expect(
    page.getByRole("columnheader", { name: "RZ global (kN)" }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "RZ local (kN)" }),
  ).toHaveCount(0);
  await expect(page.getByRole("cell", { name: "30", exact: true })).toHaveCount(
    2,
  );
  await page.getByRole("button", { name: "Esforços", exact: true }).click();
  await expect(page.getByRole("cell", { name: "45", exact: true })).toHaveCount(
    1,
  );
  await page
    .getByRole("button", { name: "Deslocamentos", exact: true })
    .click();
  await expect(
    page.getByRole("cell", { name: "-8,4375", exact: true }),
  ).toHaveCount(1);
  await page.screenshot({
    path: "test-results/kstruct-analysis.png",
    fullPage: true,
  });
  await page.getByLabel("Visualização dos resultados").selectOption("deformed");
  await expect(page.locator(".elevation polyline")).toHaveCount(1);
  await page
    .locator(".explorer")
    .getByRole("button", { name: "B1", exact: true })
    .click();
  await page.getByLabel("qZ global").fill("-20");
  await page.getByLabel("qZ global").press("Tab");
  await expect(page.getByLabel("Visualização dos resultados")).toHaveValue(
    "model",
  );
  await expect(page.getByRole("cell", { name: "45", exact: true })).toHaveCount(
    0,
  );
});

test("a tabela bloqueia o colapso da barra e aceita trocar os extremos em um lote", async ({
  page,
}) => {
  await bridge(page);
  await page.goto("/");
  const button = (name: string) =>
    page.getByRole("button", { name, exact: true });
  await page.getByRole("button", { name: /Viga de referência/ }).click();
  await button("Analisar").click();
  const display = page.getByLabel("Visualização dos resultados");
  await expect(display).toHaveValue("m");
  const dialog = page.getByRole("dialog", { name: "Tabela de nós" });
  const x1 = dialog.getByLabel("X de N1", { exact: true });
  const x2 = dialog.getByLabel("X de N2", { exact: true });
  const apply = dialog.getByRole("button", { name: "Aplicar", exact: true });
  const open = button("Tabela de nós");
  await open.click();
  await x2.fill("0");
  await expect(x2).toHaveAttribute("aria-invalid", "true");
  await expect(x2).toHaveAccessibleDescription(/B1.*V1.*comprimento nulo/);
  await expect(x1).toHaveAttribute("aria-invalid", "false");
  await expect(apply).toBeDisabled();
  await x2.press("Enter");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(display).toHaveValue("m");
  await expect(button("Desfazer")).toBeDisabled();

  await open.click();
  await expect(x2).toHaveValue("6");
  await x2.fill("0");
  await expect(apply).toBeDisabled();
  await x1.fill("6");
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await expect(apply).toBeEnabled();
  await apply.click();
  await expect(display).toHaveValue("model");

  const positions = () =>
    page.evaluate(() =>
      JSON.parse(localStorage.getItem("kstruct.draft.v33")!).nodes.map(
        (n: { id: string; x: number }) => [n.id, n.x],
      ),
    );
  await expect.poll(positions).toEqual([
    ["A", 6],
    ["B", 0],
  ]);
  await button("Desfazer").click();
  await expect.poll(positions).toEqual([
    ["A", 0],
    ["B", 6],
  ]);
  await expect(button("Desfazer")).toBeDisabled();
  await button("Refazer").click();
  await expect.poll(positions).toEqual([
    ["A", 6],
    ["B", 0],
  ]);
});

test("tabela plana valida, cancela e aplica coordenadas em um único passo", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await bridge(page);
  await page.goto("/");
  const button = (name: string) =>
    page.getByRole("button", { name, exact: true });
  await page.getByRole("button", { name: /Viga de referência/ }).click();
  await button("Analisar").click();
  const display = page.getByLabel("Visualização dos resultados");
  await expect(display).toHaveValue("m");

  const beam = page
    .getByRole("application", { name: "Área de lançamento XZ" })
    .locator("line[data-member-id]");
  const beamSpan = () =>
    beam.evaluate((line) => ({
      x: Number(line.getAttribute("x2")) - Number(line.getAttribute("x1")),
      z: Number(line.getAttribute("y1")) - Number(line.getAttribute("y2")),
    }));
  const originalSpan = await beamSpan();
  const dialog = page.getByRole("dialog", { name: "Tabela de nós" });
  const apply = dialog.getByRole("button", { name: "Aplicar", exact: true });
  const x1 = dialog.getByLabel("X de N1", { exact: true });
  const z2 = dialog.getByLabel("Z de N2", { exact: true });
  await button("Tabela de nós").click();
  await expect(dialog.getByRole("columnheader")).toHaveText([
    "Nó",
    "X (m)",
    "Z (m)",
  ]);
  await x1.fill("0,0");
  await apply.click();
  await expect(dialog).toHaveCount(0);
  await expect(display).toHaveValue("m");
  await expect(button("Desfazer")).toBeDisabled();

  await button("Tabela de nós").click();
  await x1.fill("-1,25");
  await z2.fill("");
  await apply.click();
  await expect(x1).toHaveValue("-1,25");
  await expect(x1).toHaveAttribute("aria-invalid", "false");
  await expect(z2).toBeFocused();
  await expect(z2).toHaveAttribute("aria-invalid", "true");
  await expect(z2).toHaveAccessibleDescription("Preencha a coordenada.");
  await z2.fill("1e999");
  await apply.click();
  await expect(z2).toHaveAccessibleDescription("Informe um número finito.");
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect.poll(beamSpan).toEqual(originalSpan);
  await expect(display).toHaveValue("m");
  await expect(button("Desfazer")).toBeDisabled();

  await button("Tabela de nós").click();
  await expect(x1).toHaveValue("0");
  await expect(z2).toHaveValue("0");
  await x1.fill("-1,25");
  await z2.fill("2.5");
  await apply.click();
  await expect(display).toHaveValue("model");
  await expect(page.getByRole("status")).toContainText("Clique em Analisar");
  const editedSpan = await beamSpan();
  expect(editedSpan.x).toBeGreaterThan(originalSpan.x);
  expect(editedSpan.z).toBeGreaterThan(originalSpan.z);
  await button("Desfazer").click();
  await expect.poll(beamSpan).toEqual(originalSpan);
  await expect(button("Desfazer")).toBeDisabled();
  await button("Refazer").click();
  await expect.poll(beamSpan).toEqual(editedSpan);

  await page.evaluate(() => Object.assign(window, { isTauri: false }));
  const download = page.waitForEvent("download");
  await button("Salvar projeto").click();
  const path = (await (await download).path())!;
  const saved = parseProject(await readFile(path, "utf8"));
  expect(saved.nodes).toMatchObject([
    { id: "A", x: -1.25, y: 0, z: 0 },
    { id: "B", x: 6, y: 0, z: 2.5 },
  ]);
  expect(saved.members).toEqual(beamExample().members);
  await button("Novo projeto").click();
  await page
    .getByRole("dialog", { name: "Novo projeto" })
    .getByRole("button", { name: "Criar projeto", exact: true })
    .click();
  await page.locator('input[type="file"]').setInputFiles(path);
  await button("Tabela de nós").click();
  await expect(x1).toHaveValue("-1.25");
  await expect(z2).toHaveValue("2.5");
});

test("tema alterna pelo teclado, preserva as vistas e retorna após recarregar", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1100, height: 720 });
  await page.emulateMedia({ colorScheme: "light" });
  await bridge(page);
  await page.goto("/");
  const button = (name: string) =>
    page.getByRole("button", { name, exact: true });
  const root = page.locator("html");
  const meta = page.locator('meta[name="theme-color"]');
  await expect(root).toHaveAttribute("data-theme", "dark");
  await expect(root).toHaveCSS("color-scheme", "dark");
  await expect(meta).toHaveAttribute("content", "#101522");

  await page.getByRole("button", { name: /Viga de referência/ }).click();
  await button("Analisar").click();
  await expect(page.getByRole("status")).toContainText("Análise concluída");
  await page
    .locator(".explorer")
    .getByRole("button", { name: "B1", exact: true })
    .click();
  const display = page.getByLabel("Visualização dos resultados");
  await display.selectOption("deformed");
  await button("Aumentar zoom").click();
  const drawing = page.getByRole("application", {
    name: "Área de lançamento XZ",
  });
  const deformation = drawing.locator("polyline");
  const points = (await deformation.getAttribute("points"))!;
  await expect(deformation).toHaveCSS("stroke", "rgb(103, 214, 192)");

  const canvas = page.locator(".three-container canvas");
  const initialCamera = await canvas.screenshot();
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width * 0.7,
    bounds.y + bounds.height * 0.4,
    { steps: 5 },
  );
  await page.mouse.up();
  const darkScene = await canvas.screenshot();
  expect(darkScene.equals(initialCamera)).toBe(false);

  const theme = page.getByRole("combobox", { name: "Tema", exact: true });
  await button("Exibição").press("Enter");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", {
      name: "Explorador",
      exact: true,
      pressed: true,
    }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  const properties = button("Propriedades");
  await expect(properties).toBeFocused();
  const caption = page.getByText("ÁREA DE TRABALHO", { exact: true });
  const focusBottom = await properties.evaluate((element) => {
    const style = getComputedStyle(element);
    return (
      element.getBoundingClientRect().bottom +
      parseFloat(style.outlineOffset) +
      parseFloat(style.outlineWidth)
    );
  });
  expect(focusBottom).toBeLessThanOrEqual((await caption.boundingBox())!.y);
  await properties.press("Space");
  await expect(properties).toHaveAttribute("aria-pressed", "false");
  await properties.press("Space");
  await expect(properties).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(theme).toBeFocused();
  await expect(theme).toHaveCSS("outline-style", "solid");
  await expect(theme).toHaveValue("dark");
  await page.keyboard.press("End");
  await expect(theme).toHaveValue("light");
  await expect(theme).toBeInViewport();
  await expect(theme).toHaveCSS("outline-color", "rgb(96, 51, 152)");
  await expect(button("Analisar")).toBeInViewport();
  await expect(root).toHaveCSS("color-scheme", "light");
  await expect(meta).toHaveAttribute("content", "#eff3f8");
  await expect(page.locator(".viewport.elevation")).toHaveCSS(
    "background-color",
    "rgb(245, 248, 252)",
  );
  await expect(deformation).toHaveCSS("stroke", "rgb(0, 105, 95)");
  await expect(deformation).toHaveAttribute("points", points);
  await expect(
    page.getByRole("heading", { name: "B1", exact: true }),
  ).toBeVisible();
  await expect(display).toHaveValue("deformed");

  const lightScene = await canvas.screenshot();
  const backgroundPixel = await page.evaluate(async (data) => {
    const response = await fetch(`data:image/png;base64,${data}`);
    const image = await createImageBitmap(await response.blob());
    const context = new OffscreenCanvas(image.width, image.height).getContext(
      "2d",
    )!;
    context.drawImage(image, 0, 0);
    image.close();
    return Array.from(context.getImageData(4, 4, 1, 1).data);
  }, lightScene.toString("base64"));
  expect(backgroundPixel).toEqual([237, 243, 250, 255]);
  await page.keyboard.press("Home");
  await expect(theme).toHaveValue("dark");
  await expect(root).toHaveCSS("color-scheme", "dark");
  expect((await canvas.screenshot()).equals(darkScene)).toBe(true);

  await page.keyboard.press("End");
  await expect(theme).toHaveValue("light");
  await page.reload();
  await expect(root).toHaveAttribute("data-theme", "light");
  await expect(root).toHaveCSS("color-scheme", "light");
  await button("Exibição").click();
  await expect(theme).toHaveValue("light");

  await page.evaluate(() => localStorage.setItem("kstruct.theme", "inválido"));
  await page.reload();
  await expect(root).toHaveAttribute("data-theme", "dark");
});

test("combinação linear lista casos pendentes, consulta resultados e preserva a composição", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await bridge(page);
  await page.goto("/");
  const button = (name: string) =>
    page.getByRole("button", { name, exact: true });
  await page.getByRole("button", { name: /Viga de referência/ }).click();
  await button("Cargas e casos").click();
  const editor = page.getByRole("dialog", {
    name: "Padrões, casos, combinações e envelopes",
  });
  const editButton = (name: string) =>
    editor.getByRole("button", { name, exact: true });
  await editButton("Casos estáticos").click();
  await editor.getByLabel("Nome do caso").fill("Permanente");
  await editButton("Novo caso").click();
  await editor.getByLabel("Nome do caso").fill("Variável");
  const secondary = await editor.getByLabel("Caso para editar").inputValue();
  await editButton("Combinações lineares").click();
  await editButton("Nova combinação").click();
  await editor.getByLabel("Nome da combinação").fill("Composição 1");
  await editor.getByLabel("Caso da parcela 1").selectOption("EL");
  await editButton("Adicionar parcela").click();
  await editor.getByLabel("Fator da parcela 1").fill("1,8");
  await editor.getByLabel("Fator da parcela 2").fill("-0,3");
  const combinationId = await editor
    .getByLabel("Combinação para editar")
    .inputValue();
  await editButton("Aplicar definições").click();

  const picker = page.getByLabel("Caso, combinação ou envelope", {
    exact: true,
  });
  const combo = `combination:${combinationId}`;
  const status = page.getByRole("status");
  await expect(picker).toHaveValue(combo);
  await expect(status).toContainText("Permanente, Variável");
  await expect(button("Analisar")).toBeDisabled();
  await picker.selectOption("EL");
  await button("Analisar").click();
  await expect(status).toContainText("Análise concluída · Permanente");
  await picker.selectOption(combo);
  await expect(status).toContainText(
    /Analise os casos pendentes.*\s+Variável$/,
  );
  await picker.selectOption(secondary);
  await button("Analisar").click();
  await expect(status).toContainText("Análise concluída · Variável");
  await picker.selectOption(combo);
  await expect(status).toContainText("1,8 × Permanente − 0,3 × Variável");
  await expect(page.getByLabel("Visualização dos resultados")).toHaveValue("m");
  await expect(page.locator(".elevation polygon")).toHaveCount(1);
  await expect(button("Saída OOFEM")).toHaveCount(0);
  await button("Esforços").click();
  await expect(
    page.getByRole("cell", { name: "67,5", exact: true }),
  ).toHaveCount(1);

  await page.evaluate(() => Object.assign(window, { isTauri: false }));
  const csvDownload = page.waitForEvent("download");
  await button("CSV").click();
  const csv = await readFile((await (await csvDownload).path())!, "utf8");
  expect(csv).toContain(
    '"Combinação";"ID da combinação";"Parcelas (ID do caso e fator)"',
  );
  expect(csv).toContain(`67.5;"Composição 1";"${combinationId}"`);
  expect(csv).toContain('""caseId"":""EL"",""factor"":1.8');

  const projectDownload = page.waitForEvent("download");
  await button("Salvar projeto").click();
  const file = (await (await projectDownload).path())!;
  const model = parseProject(await readFile(file, "utf8"));
  expect(model.resultCombinations).toEqual([
    {
      id: combinationId,
      name: "Composição 1",
      type: "linear",
      factors: [
        { caseId: "EL", factor: 1.8 },
        { caseId: secondary, factor: -0.3 },
      ],
    },
  ]);

  await button("Cargas e casos").click();
  await editButton("Casos estáticos").click();
  await editor.getByLabel("Caso para editar").selectOption(secondary);
  await editButton("Excluir caso").click();
  await expect(editor.getByRole("alert")).toContainText(
    "O caso está em uso nas combinações Composição 1",
  );
  await editButton("Combinações lineares").click();
  await editor.getByLabel("Fator da parcela 1").fill("2");
  await editButton("Aplicar definições").click();
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(page.getByLabel("Visualização dos resultados")).toHaveValue(
    "model",
  );

  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(picker).toHaveValue("EL");
  await picker.selectOption(combo);
  await button("Mensagens").click();
  await expect(status).toContainText("1,8 × Permanente − 0,3 × Variável");
  await expect(status).toContainText("Permanente, Variável");
});

test("filtro de esforços acompanha caso e combinação e limita as linhas do CSV", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const solverOutput = readFileSync(
    new URL("../fixtures/two-span-beam-oofem.txt", import.meta.url),
    "utf8",
  );
  await bridge(page, { solverOutput });
  const project = twoSpanBeam();
  const combination = {
    id: "C1",
    name: "Combinação de teste",
    type: "linear" as const,
    factors: [{ caseId: "EL", factor: 2 }],
  };
  project.resultCombinations = [combination];

  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({
    name: "dois-vaos.kstruct.json",
    mimeType: "application/json",
    buffer: Buffer.from(serializeProject(project)),
  });
  const button = (name: string) =>
    page.getByRole("button", { name, exact: true });
  await button("Esforços").click();
  const filter = page.getByRole("combobox", { name: "Barra em Esforços" });
  await expect(filter).toHaveValue("");
  await expect(filter.locator("option")).toHaveText([
    "Todas as barras",
    "B1",
    "B2",
  ]);
  await button("Analisar").click();
  const table = page.getByRole("table");
  const memberCells = table.locator("tbody td:first-child");
  const stationCells = table.locator("tbody td:nth-child(2)");
  await expect(table.getByRole("columnheader")).toHaveText([
    "Barra",
    "x/L",
    "N (kN)",
    "V (kN)",
    "M (kN·m)",
  ]);
  await expect(memberCells).toHaveText(["B1", "B1", "B1", "B2", "B2", "B2"]);

  await filter.selectOption({ label: "B2" });
  await expect(filter).toHaveValue("V2");
  await expect(memberCells).toHaveText(["B2", "B2", "B2"]);
  await expect(stationCells).toHaveText(["0", "0,5", "1"]);
  const middleMoment = table.locator("tbody td:last-child").nth(1);
  await expect(middleMoment).toHaveText("5,625");
  await page.evaluate(() => Object.assign(window, { isTauri: false }));
  const exportCsv = async () => {
    const waiting = page.waitForEvent("download");
    await button("CSV").click();
    const path = (await (await waiting).path())!;
    const [header, ...rows] = (await readFile(path, "utf8")).split("\n");
    expect(rows.map((row) => row.split(";").slice(0, 2))).toEqual([
      ['"B2"', "0"],
      ['"B2"', "0.5"],
      ['"B2"', "1"],
    ]);
    return { header, rows };
  };
  const caseCsv = await exportCsv();
  const columns = '\uFEFF"Barra";"x/L";"N (kN)";"V (kN)";"M (kN·m)"';
  expect(caseCsv.header).toBe(`${columns};"Caso";"ID do caso"`);
  for (const row of caseCsv.rows)
    expect(row).toMatch(/;"EL · Estática linear";"EL"$/);
  expect(caseCsv.rows[1]).toContain(";0.5;0;5.625;5.625;");

  const picker = page.getByLabel("Caso, combinação ou envelope", {
    exact: true,
  });
  await picker.selectOption(`combination:${combination.id}`);
  await expect(filter).toHaveValue("V2");
  await expect(memberCells).toHaveText(["B2", "B2", "B2"]);
  await expect(stationCells).toHaveText(["0", "0,5", "1"]);
  await expect(middleMoment).toHaveText("11,25");
  const combinationCsv = await exportCsv();
  expect(combinationCsv.header).toBe(
    `${columns};"Combinação";"ID da combinação";"Parcelas (ID do caso e fator)"`,
  );
  for (const row of combinationCsv.rows)
    expect(row).toMatch(
      /;"Combinação de teste";"C1";"\[\{""caseId"":""EL"",""factor"":2\}\]"$/,
    );
  expect(combinationCsv.rows[1]).toContain(";0.5;0;11.25;11.25;");

  await picker.selectOption("EL");
  await expect(filter).toHaveValue("V2");
  await expect(memberCells).toHaveText(["B2", "B2", "B2"]);
  await page
    .locator(".explorer")
    .getByRole("button", { name: "B2", exact: true })
    .click();
  await button("Excluir").click();
  await expect(filter).toHaveValue("");
  await expect(filter.locator("option")).toHaveText(["Todas as barras", "B1"]);
  await expect(table).toHaveCount(0);
  await expect(button("CSV")).toHaveCount(0);
  await expect(
    page.getByText("Execute uma análise para consultar os esforços do caso"),
  ).toBeVisible();
  await button("Desfazer").click();
  await expect(filter.locator("option")).toHaveCount(3);
  await expect(filter).toHaveValue("");
});

test("duas barras de mesmo nome continuam identificáveis no filtro, na tabela e no CSV", async ({
  page,
}) => {
  const project = twoSpanBeam();
  for (const member of project.members) member.name = "Viga";
  project.resultCombinations = [
    {
      id: "C1",
      name: "EL em dobro",
      type: "linear",
      factors: [{ caseId: "EL", factor: 2 }],
    },
  ];
  const output = readFileSync(
    new URL("../fixtures/two-span-beam-oofem.txt", import.meta.url),
    "utf8",
  );
  await bridge(page, { solverOutput: output });
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({
    name: "barras-homonimas.kstruct.json",
    mimeType: "application/json",
    buffer: Buffer.from(serializeProject(project)),
  });
  await page.getByRole("button", { name: "Analisar", exact: true }).click();
  await page.getByRole("button", { name: "Esforços", exact: true }).click();
  const filter = page.getByRole("combobox", { name: "Barra em Esforços" });
  await expect(filter.locator("option")).toHaveText([
    "Todas as barras",
    "[V1] Viga",
    "[V2] Viga",
  ]);
  const names = page.getByRole("table").locator("tbody td:first-child");
  await expect(names).toHaveText([
    "[V1] Viga",
    "[V1] Viga",
    "[V1] Viga",
    "[V2] Viga",
    "[V2] Viga",
    "[V2] Viga",
  ]);
  await filter.selectOption({ label: "[V2] Viga" });
  await page.evaluate(() => Object.assign(window, { isTauri: false }));
  for (const source of ["EL", "combination:C1"]) {
    await page
      .getByLabel("Caso, combinação ou envelope", { exact: true })
      .selectOption(source);
    await expect(filter).toHaveValue("V2");
    await expect(names).toHaveText(["[V2] Viga", "[V2] Viga", "[V2] Viga"]);
    const waiting = page.waitForEvent("download");
    await page.getByRole("button", { name: "CSV", exact: true }).click();
    const csv = await readFile((await (await waiting).path())!, "utf8");
    const [header, ...rows] = csv.split("\n");
    expect(header).toContain(
      source === "EL"
        ? '"Caso";"ID do caso"'
        : '"Combinação";"ID da combinação"',
    );
    expect(rows.map((row) => row.split(";").slice(0, 2))).toEqual([
      ['"[V2] Viga"', "0"],
      ['"[V2] Viga"', "0.5"],
      ['"[V2] Viga"', "1"],
    ]);
    expect(rows[1].split(";")[4]).toBe(source === "EL" ? "5.625" : "11.25");
  }
});

test("envelope consulta os dois extremos por estação e exporta as combinações governantes", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await bridge(page);
  await page.goto("/");
  const button = (name: string) =>
    page.getByRole("button", { name, exact: true });
  const project = beamExample();
  project.resultCombinations = [
    {
      id: "POS",
      name: "Flexão positiva",
      type: "linear",
      factors: [{ caseId: "EL", factor: 1 }],
    },
    {
      id: "NEG",
      name: "Flexão negativa",
      type: "linear",
      factors: [{ caseId: "EL", factor: -2 }],
    },
    {
      id: "OUT",
      name: "Outra combinação",
      type: "linear",
      factors: [{ caseId: "EL", factor: 10 }],
    },
  ];
  const input = page.locator('input[type="file"]');
  await input.setInputFiles({
    name: "viga.kstruct.json",
    mimeType: "application/json",
    buffer: Buffer.from(serializeProject(project)),
  });
  await expect(page.locator(".model-count")).toHaveText("2 nós · 1 barras");
  await button("Cargas e casos").click();
  const editor = page.getByRole("dialog", {
    name: "Padrões, casos, combinações e envelopes",
  });
  const editButton = (name: string) =>
    editor.getByRole("button", { name, exact: true });
  await editButton("Envelopes").click();
  await editButton("Novo envelope").click();
  await editor.getByLabel("Nome do envelope").fill("Envelope de projeto");
  await editButton("Aplicar definições").click();
  await expect(editor.getByRole("alert")).toContainText(
    "Selecione pelo menos uma combinação",
  );
  await editor.getByRole("checkbox", { name: "Flexão positiva" }).check();
  await editor.getByRole("checkbox", { name: "Flexão negativa" }).check();
  const envelopeId = await editor
    .getByLabel("Envelope para editar")
    .inputValue();
  await editButton("Aplicar definições").click();

  const picker = page.getByLabel("Caso, combinação ou envelope", {
    exact: true,
  });
  const envelopeOption = `envelope:${envelopeId}`;
  const region = page.getByRole("region", { name: "Resultados do envelope" });
  const plot = page.locator(".envelope-plot");
  const table = region.getByRole("table");
  await expect(picker).toHaveValue(envelopeOption);
  await expect(region.getByRole("status")).toContainText(
    "Analise os casos pendentes nesta revisão.",
  );
  await expect(button("Analisar")).toBeDisabled();

  await button("Cargas e casos").click();
  await editButton("Combinações lineares").click();
  await editor.getByLabel("Combinação para editar").selectOption("POS");
  await editButton("Excluir combinação").click();
  await expect(editor.getByRole("alert")).toContainText(
    "A combinação está em uso nos envelopes Envelope de projeto",
  );
  await editButton("Cancelar").click();
  await picker.selectOption("EL");
  await button("Analisar").click();
  await expect(page.getByRole("status")).toContainText("Análise concluída");
  await picker.selectOption(envelopeOption);
  await expect(plot).toHaveCount(1);
  await expect(page.getByLabel("Visualização dos resultados")).toHaveValue("m");
  // Nesta viga simétrica, o centro da faixa corresponde a x/L = 0,5.
  // O clique pelo elemento acompanha a vista quando a tabela muda de altura.
  await plot.locator(".envelope-fill").click();
  await expect(region.getByLabel("Estação x/L")).toHaveValue("4");
  const maximum = plot.locator(".envelope-max-line polyline");
  const minimum = plot.locator(".envelope-min-line polyline");
  await expect(maximum).toHaveCSS("stroke", "rgb(130, 220, 230)");
  await expect(minimum).toHaveCSS("stroke", "rgb(242, 174, 122)");
  await button("Exibição").click();
  await page
    .getByRole("combobox", { name: "Tema", exact: true })
    .selectOption("light");
  await expect(maximum).toHaveCSS("stroke", "rgb(0, 101, 119)");
  await expect(minimum).toHaveCSS("stroke", "rgb(145, 63, 18)");
  await expect(region.getByLabel("Barra do envelope")).toHaveValue("V1");
  await expect(region.getByLabel("Estação x/L")).toHaveValue("4");
  await expect(picker).toHaveValue(envelopeOption);
  const max = table.getByRole("row", { name: /Máximo/ });
  const min = table.getByRole("row", { name: /Mínimo/ });
  await expect(max).toContainText("Flexão positiva");
  await expect(
    max.getByRole("cell", { name: "45", exact: true }),
  ).toBeVisible();
  await expect(min).toContainText("Flexão negativa");
  await expect(
    min.getByRole("cell", { name: "-90", exact: true }),
  ).toBeVisible();

  await page.evaluate(() => Object.assign(window, { isTauri: false }));
  const csvDownload = page.waitForEvent("download");
  await region.getByRole("button", { name: "CSV", exact: true }).click();
  const csv = await readFile((await (await csvDownload).path())!, "utf8");
  const csvRows = csv.split("\n");
  const maxRow = csvRows.find((row) =>
    row.includes(';0.5;"M";"Máximo";"Flexão positiva";"POS";'),
  );
  const minRow = csvRows.find((row) =>
    row.includes(';0.5;"M";"Mínimo";"Flexão negativa";"NEG";'),
  );
  expect(maxRow).toContain(";45;");
  expect(minRow).toContain(";-90;");
  expect(csv).not.toContain("Outra combinação");

  const projectDownload = page.waitForEvent("download");
  await button("Salvar projeto").click();
  const path = (await (await projectDownload).path())!;
  const saved = parseProject(await readFile(path, "utf8"));
  expect(saved.resultEnvelopes).toEqual([
    {
      id: envelopeId,
      name: "Envelope de projeto",
      combinationIds: ["POS", "NEG"],
    },
  ]);
  await page.getByLabel("qZ global", { exact: true }).fill("-20");
  await page.getByLabel("qZ global", { exact: true }).press("Enter");
  await expect(plot).toHaveCount(0);
  await expect(table).toHaveCount(0);
  await expect(region.getByRole("status")).toContainText(
    "Analise os casos pendentes",
  );

  await input.setInputFiles(path);
  await expect(picker).toHaveValue("EL");
  await picker.selectOption(envelopeOption);
  await expect(region.getByRole("status")).toContainText(
    "Analise os casos pendentes",
  );
});

test("resposta antiga é descartada quando o modelo muda durante a execução", async ({
  page,
}) => {
  await bridge(page, { delayed: true });
  await page.goto("/");
  await page.getByRole("button", { name: /Viga de referência/ }).click();
  await page.getByRole("button", { name: "Analisar", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("em execução");
  await page
    .locator(".explorer")
    .getByRole("button", { name: "B1", exact: true })
    .click();
  await page.getByLabel("qZ global").fill("-20");
  await page.getByLabel("qZ global").press("Tab");
  await page.evaluate(() =>
    (window as unknown as { finishAnalysis: () => void }).finishAnalysis(),
  );
  await expect(page.getByRole("status")).toContainText(
    "mudou durante a análise",
  );
  await expect(page.getByLabel("Visualização dos resultados")).toHaveValue(
    "model",
  );
});

test("cancelamento não publica resultados e o log é recuperado ao reabrir", async ({
  page,
}) => {
  await bridge(page, { delayed: true });
  await page.goto("/");
  await page.getByRole("button", { name: /Viga de referência/ }).click();
  await page.getByRole("button", { name: "Analisar", exact: true }).click();
  await page.getByRole("button", { name: "Cancelar análise" }).click();
  await expect(page.getByRole("status")).toContainText("Análise cancelada.");
  await expect(page.getByLabel("Visualização dos resultados")).toHaveValue(
    "model",
  );
  await page.reload();
  await page.getByRole("button", { name: "Análise", exact: true }).click();
  await page.getByRole("button", { name: "Histórico de análises" }).click();
  const history = page.getByRole("dialog", { name: "Histórico de análises" });
  await expect(
    history.getByRole("heading", { name: "Cancelado" }),
  ).toBeVisible();
  await expect(
    history.getByText("Saída do OOFEM para a viga de referência"),
  ).toBeVisible();
});

test("configurações exibem origem, versão e resultado do diagnóstico", async ({
  page,
}) => {
  await bridge(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Configurar OOFEM", exact: true })
    .click();
  const settings = page.getByRole("dialog", { name: "Motor OOFEM" });
  await settings.getByRole("button", { name: "Testar motor" }).click();
  await expect(settings.getByRole("status")).toContainText(
    "Integrado ao KStruct",
  );
  await expect(settings.getByRole("status")).toContainText("OOFEM 3.0");
  await expect(settings.getByRole("status")).toContainText("Flecha -8,4375 mm");
});

test("fila serial retoma após cancelamento e falha e descarta revisão obsoleta", async ({
  page,
}) => {
  await bridge(page, { delayed: true });
  await page.goto("/");
  const project = beamExample();
  project.analysisCases.push(
    { ...project.analysisCases[0], id: "CP", name: "Segundo caso" },
    { ...project.analysisCases[0], id: "ZERO", name: "Caso de fator zero" },
  );
  project.resultCombinations = ["C1", "C2"].map((id) => ({
    id,
    name: id,
    type: "linear",
    factors: [
      { caseId: "CP", factor: 0.2 },
      { caseId: "EL", factor: 1 },
      { caseId: "ZERO", factor: 0 },
    ],
  }));
  project.resultEnvelopes = [
    { id: "E1", name: "Envelope de teste", combinationIds: ["C1", "C2"] },
  ];
  await openProjectInBrowser(
    page,
    "fila.kstruct.json",
    serializeProject(project),
  );
  await page
    .getByLabel("Caso, combinação ou envelope")
    .selectOption("envelope:E1");
  const queue = page.getByRole("region", { name: "Fila de casos" });
  const start = queue.getByRole("button", {
    name: "Analisar casos necessários",
  });
  const cancel = page.getByRole("button", { name: "Cancelar análise" });
  const starts = () =>
    page.evaluate(() =>
      JSON.parse(sessionStorage.getItem("e2e-case-starts") ?? "[]"),
    );
  const finish = (options?: { fail?: boolean; cancelNext?: boolean }) =>
    page.evaluate(
      (options) =>
        (
          window as unknown as { finishAnalysis: (options: unknown) => void }
        ).finishAnalysis(options),
      options,
    );
  const first = project.analysisCases[0].name;

  await expect(queue.locator("li")).toHaveCount(2);
  await start.evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect(queue).toContainText("Executando 1 de 2");
  await expect(cancel).toBeEnabled();
  expect(await starts()).toEqual([first]);
  await finish({ cancelNext: true });
  await expect(queue).toContainText("Fila interrompida");
  await expect(queue.locator("li").first()).toContainText("Disponível");
  expect(await starts()).toEqual([first]);

  await start.click();
  await expect(queue).toContainText("Executando 1 de 1");
  await expect(cancel).toBeEnabled();
  await finish({ fail: true });
  await expect(queue).toContainText("Falha controlada no motor");
  await expect(queue).toContainText("Segundo caso [CP] · Falhou");
  expect(await starts()).toEqual([first, "Segundo caso"]);

  await start.click();
  await expect(cancel).toBeEnabled();
  await cancel.click();
  await expect(queue).toContainText("Análise cancelada");
  await expect(queue).toContainText("Segundo caso [CP] · Pendente");

  await start.click();
  await expect(cancel).toBeEnabled();
  await page
    .locator(".explorer")
    .getByRole("button", { name: "B1", exact: true })
    .click();
  await page.getByLabel("qZ global").fill("-20");
  await page.getByLabel("qZ global").press("Tab");
  await finish();
  await expect(queue).toContainText("O modelo mudou durante a análise");
  await expect(queue.getByText(/Pendente/)).toHaveCount(2);
  await expect(
    page
      .getByRole("region", { name: "Resultados do envelope" })
      .getByRole("status"),
  ).toContainText("Analise os casos pendentes");
  expect(await starts()).toEqual([
    first,
    "Segundo caso",
    "Segundo caso",
    "Segundo caso",
  ]);

  await start.click();
  await expect(cancel).toBeEnabled();
  expect((await starts()).at(-1)).toBe(first);
  await cancel.click();
  await expect(start).toBeEnabled();

  await page.getByRole("button", { name: "Análise", exact: true }).click();
  await page.getByRole("button", { name: "Histórico de análises" }).click();
  const history = page.getByRole("dialog", { name: "Histórico de análises" });
  await expect(history).toContainText("Segundo caso");
  await expect(history).toContainText("Falha");
});

test("pórtico em L com fila e análise manual no OOFEM 3.0", async ({
  page,
}) => {
  const executable = process.env.OOFEM_BIN;
  test.skip(!executable, "Configure OOFEM_BIN para o ensaio real.");
  test.setTimeout(90_000);
  await page.exposeFunction("solveQueueDeck", (deck: string) =>
    runDeck(deck, executable!),
  );
  await bridge(page, { realSolver: true });
  const example = readFileSync(
    new URL(
      "../../examples/portico-em-l-envelopes.kstruct.json",
      import.meta.url,
    ),
    "utf8",
  );
  await page.goto("/");
  const picker = page.getByLabel("Caso, combinação ou envelope");
  const queue = page.getByRole("region", { name: "Fila de casos" });
  const start = queue.getByRole("button", {
    name: "Analisar casos necessários",
  });
  const run = page.getByRole("button", { name: "Analisar", exact: true });
  const envelope = page.getByRole("region", { name: "Resultados do envelope" });
  const starts = () =>
    page.evaluate(() =>
      JSON.parse(sessionStorage.getItem("e2e-case-starts") ?? "[]"),
    );
  async function openExample() {
    await openProjectInBrowser(page, "portico.kstruct.json", example);
    await page.evaluate(() => sessionStorage.removeItem("e2e-case-starts"));
  }
  async function midspan() {
    await envelope
      .getByLabel("Barra do envelope")
      .selectOption("V1", { timeout: 5000 });
    await envelope
      .getByLabel("Estação x/L")
      .selectOption({ label: "0,5" }, { timeout: 5000 });
    const table = envelope.getByRole("table");
    await expect(table).toContainText("11,99");
    return table.innerText();
  }

  await openExample();
  await picker.selectOption("envelope:E1");
  await start.click();
  await expect(queue).toContainText("Casos necessários concluídos");
  expect(await starts()).toEqual(["EL · Estática linear", "CP · Compressão"]);
  const batch = await midspan();
  await start.click();
  await expect(queue).toContainText("já estão disponíveis");
  expect(await starts()).toHaveLength(2);

  await openExample();
  await run.click();
  await expect(page.getByRole("status")).toContainText(
    "Análise concluída · EL",
  );
  await picker.selectOption("envelope:E1");
  await expect(queue).toContainText("1 de 2 casos disponíveis");
  await start.click();
  await expect(queue).toContainText("Casos necessários concluídos");
  expect(await starts()).toEqual(["EL · Estática linear", "CP · Compressão"]);
  expect(await midspan()).toBe(batch);

  await openExample();
  await run.click();
  await expect(page.getByRole("status")).toContainText(
    "Análise concluída · EL",
  );
  await picker.selectOption("CP");
  await run.click();
  await expect(page.getByRole("status")).toContainText(
    "Análise concluída · CP",
  );
  await picker.selectOption("envelope:E1");
  expect(await midspan()).toBe(batch);
});

test("gera ELU/ELS, revisa exclusões e edições, salva e usa a combinação na fila", async ({
  page,
}) => {
  test.setTimeout(100_000);
  await page.goto("/");
  await openProjectInBrowser(
    page,
    "familias.kstruct.json",
    serializeProject(familyBeam()),
  );
  const button = (name: string) =>
    page.getByRole("button", { name, exact: true });
  const openEditor = async () => {
    await button("Cargas e casos").click();
    await button("Combinações lineares").click();
    await button("Gerar famílias ELU/ELS").click();
  };
  await openEditor();
  for (const [name, role] of [
    ["G", "permanent"],
    ["Q1", "variable"],
    ["Q2", "variable"],
  ])
    await page
      .getByLabel(`Classificação de ${name}`, { exact: true })
      .selectOption(role);
  await expect(page.getByRole("dialog")).toContainText("1 × Padrão Q2");
  for (const [label, v] of [
    ["Permanente em ELU", "1,2"],
    ["Principal em ELU", "1,5"],
    ["Acompanhante em ELU", "0,75"],
    ["Acompanhante em ELS", "0,3"],
  ])
    await page.getByLabel(label, { exact: true }).fill(v);
  await page.getByLabel("Incluir família ELS", { exact: true }).check();
  await page
    .getByLabel("Origem dos coeficientes", { exact: true })
    .first()
    .fill("Ensaio ilustrativo");
  await button("Gerar prévia").click();
  const row = (name: string) =>
    page.getByRole("region", { name: `Prévia ${name}`, exact: true });
  await expect(row("ELU · Q1")).toContainText("1,2 × G + 1,5 × Q1 + 0,75 × Q2");
  await expect(row("ELU · Q2")).toContainText("1,2 × G + 0,75 × Q1 + 1,5 × Q2");
  const els = row("ELS · Q1");
  await els.getByRole("button", { name: "Editar linha" }).click();
  await els.getByLabel("Nome da linha").fill("ELS revisada");
  await els.getByLabel("Fator de Q2").fill("0,4");
  await row("ELS · Q2").getByRole("checkbox").uncheck();
  await button("Usar linhas selecionadas").click();
  await button("Envelopes").click();
  await page.getByRole("checkbox", { name: "ELU · Q1", exact: true }).check();
  await button("Aplicar definições").click();
  const stored = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem("kstruct.draft.v33")!));
  await expect
    .poll(async () => (await stored()).resultCombinations.length)
    .toBe(4);
  await button("Desfazer").click();
  await expect
    .poll(async () => (await stored()).resultCombinations.length)
    .toBe(1);
  await button("Refazer").click();
  const download = page.waitForEvent("download");
  await button("Salvar projeto").click();
  const source = await readFile((await (await download).path())!, "utf8");
  const saved = parseProject(source);
  const id = saved.resultCombinations.find((c) => c.name === "ELU · Q1")!.id;
  expect(saved.resultEnvelopes[0].combinationIds).toEqual(["MAN", id]);
  await openProjectInBrowser(page, "reaberto.kstruct.json", source);
  await openEditor();
  await expect(
    page.getByLabel("Principal em ELU", { exact: true }),
  ).toHaveValue("1.5");
  await page
    .getByLabel("Grupo de exclusão de Q1", { exact: true })
    .fill("Vento");
  await page
    .getByLabel("Grupo de exclusão de Q2", { exact: true })
    .fill("Vento");
  await button("Gerar prévia").click();
  await expect(row("ELU · Q1").locator(".family-expression")).toHaveText(
    "ELU · Q1 = 1,2 × G + 1,5 × Q1",
  );
  await expect(row("ELU · Q2").locator(".family-expression")).toHaveText(
    "ELU · Q2 = 1,2 × G + 1,5 × Q2",
  );
  await expect(els).toContainText("ELS revisada");
  await expect(els).toContainText("mutuamente exclusivos");
  await expect(button("Usar linhas selecionadas")).toBeDisabled();
  await els.getByRole("button", { name: "Editar linha" }).click();
  await els.getByRole("button", { name: "Usar proposta recalculada" }).click();
  await expect(button("Usar linhas selecionadas")).toBeEnabled();
  await button("Cancelar geração").click();
  await button("Cancelar").click();
  expect((await stored()).resultCombinations).toEqual(saved.resultCombinations);
  if (process.env.OOFEM_BIN) {
    await page.exposeFunction("solveQueueDeck", (deck: string) =>
      runDeck(deck, process.env.OOFEM_BIN!),
    );
    await bridge(page, { realSolver: true });
    await page.reload();
    await page
      .getByLabel("Caso, combinação ou envelope")
      .selectOption("combination:" + id);
    await button("Analisar casos necessários").click();
    await expect(
      page.getByRole("region", { name: "Fila de casos" }),
    ).toContainText("Casos necessários concluídos");
    await button("Reações").click();
    await expect(
      page.getByRole("cell", { name: "21,6", exact: true }),
    ).toHaveCount(2);
    expect(
      await page.evaluate(() =>
        JSON.parse(sessionStorage.getItem("e2e-case-starts")!),
      ),
    ).toEqual(["G", "Q1", "Q2"]);
  }
});

async function downloadNodalCsv(page: Page) {
  await page.evaluate(() => Object.assign(window, { isTauri: false }));
  const pending = page.waitForEvent("download");
  await page
    .getByRole("region", { name: "Resultados do envelope" })
    .getByRole("button", { name: "CSV", exact: true })
    .click();
  const csv = await readFile((await (await pending).path())!, "utf8");
  const [headers, ...lines] = csv
    .trim()
    .split("\n")
    .map((line) =>
      Array.from(
        line.matchAll(/("(?:[^"]|"")*"|[^;]+)(?:;|$)/g),
        ([, field]) =>
          field.startsWith('"')
            ? field.slice(1, -1).replaceAll('""', '"')
            : field,
      ),
    );
  return lines.map((line) =>
    Object.fromEntries(headers.map((key, i) => [key, line[i]])),
  );
}

test("envelope nodal XZ consulta as componentes ativas e retira tabela e CSV após edição", async ({
  page,
}) => {
  const executable = process.env.OOFEM_BIN;
  if (executable)
    await page.exposeFunction("solveQueueDeck", (deck: string) =>
      runDeck(deck, executable),
    );
  await bridge(page, { realSolver: !!executable });
  await page.goto("/");
  await openProjectInBrowser(
    page,
    "viga.kstruct.json",
    serializeProject(planarNodalEnvelope()),
  );
  await page
    .getByLabel("Caso, combinação ou envelope")
    .selectOption("envelope:E");
  const region = page.getByRole("region", { name: "Resultados do envelope" });
  await region.getByRole("button", { name: "Reações de apoio" }).click();
  await page
    .getByRole("button", { name: "Analisar casos necessários" })
    .click();
  const component = region.getByLabel("Componente nodal");
  await expect(component.locator("option")).toHaveText(["Fx", "Fz", "My"]);
  await component.selectOption("fz");
  const reaction = region.getByRole("table", {
    name: "Reações simultâneas do envelope",
  });
  await expect(reaction.getByRole("row", { name: /Mínimo/ })).toContainText(
    "Invertida [B]",
  );
  await expect(
    reaction.getByRole("row", { name: /Máximo/ }).locator(".governing-force"),
  ).toHaveText("30");
  const reactions = await downloadNodalCsv(page);
  expect(reactions).toHaveLength(2);
  expect(reactions[0]).toMatchObject({
    "ID do nó": "A",
    "ID da combinação": "B",
    "Fz (kN)": "-60",
  });
  await region.getByRole("button", { name: "Deslocamentos nodais" }).click();
  await expect(component.locator("option")).toHaveText(["Ux", "Uz", "Ry"]);
  await region.getByLabel("Nó do envelope").selectOption("B");
  await component.selectOption("ry");
  const displacements = await downloadNodalCsv(page);
  expect(displacements[1]).toMatchObject({
    "ID do nó": "B",
    "ID da combinação": "B",
  });
  expect(Number(displacements[1]["Ry (mrad)"])).toBeCloseTo(9, 6);
  await page
    .locator(".explorer")
    .getByRole("button", { name: "B1", exact: true })
    .click();
  await page.getByLabel("qZ global", { exact: true }).fill("-20");
  await page.getByLabel("qZ global", { exact: true }).press("Enter");
  await expect(region.getByRole("status")).toContainText(
    "Analise os casos pendentes",
  );
  await expect(region.getByRole("table")).toHaveCount(0);
  await expect(
    region.getByRole("button", { name: "CSV", exact: true }),
  ).toHaveCount(0);
});

test("envelope nodal XYZ exporta as seis componentes simultâneas e a origem de cada apoio após troca de base e unidades", async ({
  page,
}) => {
  const executable = process.env.OOFEM_BIN;
  test.skip(!executable, "Configure OOFEM_BIN para o pórtico espacial.");
  await page.exposeFunction("solveQueueDeck", (deck: string) =>
    runDeck(deck, executable!),
  );
  await bridge(page, { realSolver: true });
  await page.goto("/");
  await openProjectInBrowser(
    page,
    "portico-nodal.kstruct.json",
    serializeProject(spatialNodalEnvelope()),
  );
  await page
    .getByLabel("Caso, combinação ou envelope")
    .selectOption("envelope:E");
  await page
    .getByRole("button", { name: "Analisar casos necessários" })
    .click();
  const region = page.getByRole("region", { name: "Resultados do envelope" });
  await region.getByRole("button", { name: "Reações de apoio" }).click();
  const component = region.getByLabel("Componente nodal");
  await expect(component.locator("option")).toHaveText([
    "Fx",
    "Fy",
    "Fz",
    "Mx",
    "My",
    "Mz",
  ]);
  await region.getByLabel("Apoio do envelope").selectOption("N7");
  await component.selectOption("fy");
  const maximum = region.getByRole("row", { name: /Máximo/ });
  await expect(maximum).toContainText("Combinação B [B]");
  await region.getByLabel("Referencial do envelope").selectOption("local");
  await expect(maximum).toContainText("Combinação A [A]");
  await expect(maximum.locator(".governing-force")).toHaveText("3,46889");
  await component.selectOption("fx");
  await region.getByLabel("Apoio do envelope").selectOption("");
  const first = await downloadNodalCsv(page);
  expect(first).toHaveLength(6);
  const maxima = first.filter((r) => r.Extremo === "Máximo");
  expect(
    maxima.map((r) => [r["ID do nó"], r.Referencial, r["ID da combinação"]]),
  ).toEqual([
    ["N7", "Local do apoio", "B"],
    ["N8", "Global", "B"],
    ["N9", "Global", "A"],
  ]);
  expect(maxima[0]["Tipo da origem"]).toBe("Combinação linear");
  expect(JSON.parse(maxima[0]["Parcelas (ID, nome do caso e fator)"])).toEqual([
    { caseId: "G", name: "Carga permanente", factor: 0.7 },
    { caseId: "W", name: "Carga na cobertura", factor: -1.1 },
  ]);
  const axes = JSON.parse(
    maxima[0]["Eixos do referencial em coordenadas globais"],
  );
  expect(axes.x.x).toBeCloseTo(0.6, 12);
  expect(axes.x.y).toBeCloseTo(0.8, 12);
  await region.getByRole("button", { name: "Deslocamentos nodais" }).click();
  await region.getByLabel("Nó do envelope").selectOption("N5");
  await expect(component.locator("option")).toHaveText([
    "Ux",
    "Uy",
    "Uz",
    "Rx",
    "Ry",
    "Rz",
  ]);
  await component.selectOption("uz");
  const before = await downloadNodalCsv(page);
  expect(Number(before[1]["Uz (mm)"])).toBeCloseTo(-0.001739746, 8);
  expect(before[1]["ID da combinação"]).toBe("B");
  await page.getByRole("button", { name: "Exibição", exact: true }).click();
  await page.getByRole("button", { name: "Unidades", exact: true }).click();
  const units = page.getByRole("dialog", { name: "Unidades", exact: true });
  for (const [name, unit] of [
    ["Deslocamentos", "m"],
    ["Forças", "N"],
    ["Momentos", "N·m"],
  ])
    await units.getByRole("combobox", { name, exact: true }).selectOption(unit);
  await units.getByRole("button", { name: "Aplicar unidades" }).click();
  const after = await downloadNodalCsv(page);
  for (const [i, row] of after.entries()) {
    expect(row["ID da combinação"]).toBe(before[i]["ID da combinação"]);
    for (const key of ["Ux", "Uy", "Uz"])
      expect(Number(row[`${key} (m)`])).toBeCloseTo(
        Number(before[i][`${key} (mm)`]) / 1000,
        12,
      );
    for (const key of ["Rx", "Ry", "Rz"])
      expect(row[`${key} (mrad)`]).toBe(before[i][`${key} (mrad)`]);
  }
  await region.getByRole("button", { name: "Reações de apoio" }).click();
  await region.getByLabel("Apoio do envelope").selectOption("");
  await region.getByLabel("Referencial do envelope").selectOption("local");
  const inSI = await downloadNodalCsv(page);
  for (const [i, row] of inSI.entries()) {
    expect(row["ID da combinação"]).toBe(first[i]["ID da combinação"]);
    for (const key of ["Fx", "Fy", "Fz", "Mx", "My", "Mz"]) {
      const unit = key[0] === "F" ? "N" : "N·m";
      expect(Number(row[`${key} (${unit})`])).toBeCloseTo(
        1000 * Number(first[i][`${key} (k${unit})`]),
        8,
      );
    }
  }
  expect(
    await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem("e2e-case-starts") ?? "[]"),
    ),
  ).toHaveLength(2);
});

test("consulta o diagrama em x e x/L, escolhe a face e sincroniza cursor, tabela e unidades", async ({
  page,
}) => {
  const executable = process.env.OOFEM_BIN;
  test.skip(
    !executable,
    "Configure OOFEM_BIN para o ensaio com carga concentrada.",
  );
  await page.exposeFunction("solveQueueDeck", (deck: string) =>
    runDeck(deck, executable!),
  );
  await bridge(page, { realSolver: true });
  await page.goto("/");
  const p = pointLoadBeam();
  p.mesh.segmentsPerMember = 3;
  await openProjectInBrowser(page, "forca.kstruct.json", serializeProject(p));
  await page.getByRole("button", { name: "Analisar", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Análise concluída");
  await page
    .getByRole("button", { name: "Consultar seção", exact: true })
    .click();
  const table = page.getByRole("table", {
    name: "Esforços na seção consultada",
  });
  const position = page.getByLabel("Posição consultada");
  const enter = async (label: string, value: string) => {
    const input = page.getByRole("textbox", { name: label, exact: true });
    await input.fill(value);
    await input.press("Enter");
  };
  await page.getByLabel("Componente do diagrama").selectOption("v");
  await enter("Distância x (m)", "2");
  await expect(table.locator(".governing-force").last()).toHaveText("8");
  await expect(
    table.getByRole("cell", { name: "16", exact: true }),
  ).toBeVisible();
  await expect(position).toContainText("Amostra do OOFEM");
  const marker = page.locator("circle.section-cursor").first();
  await expect(marker).toBeVisible();
  const ordinate = await marker.getAttribute("cy");
  await page.getByLabel("Face da descontinuidade").selectOption("right");
  await expect(marker).not.toHaveAttribute("cy", ordinate!);
  await expect(table.locator(".governing-force").last()).toHaveText("-4");
  await page.getByRole("button", { name: "Exibição", exact: true }).click();
  await page.getByRole("button", { name: "Unidades", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Unidades", exact: true });
  await dialog
    .getByRole("combobox", { name: "Comprimentos", exact: true })
    .selectOption("cm");
  await dialog.getByRole("button", { name: "Aplicar unidades" }).click();
  await expect(page.getByLabel("Distância x (cm)")).toHaveValue("200");
  await enter("Distância x (cm)", "200");
  await expect(table.locator(".governing-force").last()).toHaveText("-4");
  await page.getByLabel("Coordenada da consulta").selectOption("ratio");
  await enter("Posição x/L", "1/3");
  await expect(position).toContainText("x = 200 cm");
  await expect(page.getByLabel("Face da descontinuidade")).toHaveValue("right");
  await enter("Posição x/L", "1,2");
  await expect(page.getByRole("alert")).toContainText("entre 0 e 1");
  await expect(table.locator(".governing-force").last()).toHaveText("-4");
  await enter("Posição x/L", "0,5");
  await expect(position).toContainText("Interpolação linear no trecho");
  await expect(page.getByLabel("Estação x/L")).toHaveValue("");
  await expect(
    table.getByRole("cell", { name: "12", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Mensagens", exact: true }).click();
  const axis = page.locator('line[data-member-id="V1"]').first();
  const point = await axis.evaluate((e) => {
    const line = e as SVGLineElement,
      svg = line.ownerSVGElement!;
    const p = svg.createSVGPoint();
    p.x = (line.x1.baseVal.value + line.x2.baseVal.value) / 2;
    p.y = (line.y1.baseVal.value + line.y2.baseVal.value) / 2;
    const loc = p.matrixTransform(line.getScreenCTM()!);
    return { x: loc.x, y: loc.y };
  });
  await page.mouse.click(point.x, point.y);
  await expect(table).toBeVisible();
  await expect(page.getByLabel("Barra da consulta")).toHaveValue("V1");
  await expect(page.getByLabel("Distância x (cm)")).toHaveValue(
    /^30[0-1]|^299/,
  );
});

test("o extremo calculado do envelope recupera a combinação que governa entre estações", async ({
  page,
}) => {
  const executable = process.env.OOFEM_BIN;
  test.skip(!executable, "Configure OOFEM_BIN para o ensaio de envelope.");
  await page.exposeFunction("solveQueueDeck", (deck: string) =>
    runDeck(deck, executable!),
  );
  await bridge(page, { realSolver: true });
  await page.goto("/");
  await openProjectInBrowser(
    page,
    "envelope.kstruct.json",
    serializeProject(diagramEnvelope()),
  );
  const picker = page.getByLabel("Caso, combinação ou envelope");
  await picker.selectOption("envelope:E");
  await page
    .getByRole("button", { name: "Analisar casos necessários" })
    .click();
  const region = page.getByRole("region", { name: "Resultados do envelope" });
  const table = region.getByRole("table", {
    name: "Esforços simultâneos do envelope",
  });
  await region.getByRole("button", { name: "Ir ao máximo" }).click();
  const max = table.getByRole("row", { name: /Máximo/ }),
    min = table.getByRole("row", { name: /Mínimo/ });
  await expect(region.getByLabel("Posição consultada")).toContainText(
    "Máximo · Lei do esforço · x = 3 m",
  );
  await expect(max).toContainText("[C-EL]");
  await expect(max.locator(".governing-force")).toHaveText("45");
  await expect(min).toContainText("[C-CP]");
  await expect(min.locator(".governing-force")).toHaveText("42");
  await region
    .getByLabel("Domínio da busca de extremos")
    .selectOption("samples");
  await region.getByRole("button", { name: "Ir ao máximo" }).click();
  await expect(region.getByLabel("Posição consultada")).toContainText(
    "estações amostradas",
  );
  await expect(max).toContainText("[C-CP]");
  await expect(max.locator(".governing-force")).toHaveText("42");
  await picker.selectOption("combination:C-EL");
  await page
    .getByRole("button", { name: "Consultar seção", exact: true })
    .click();
  await page.getByLabel("Domínio da busca de extremos").selectOption("samples");
  await page.getByRole("button", { name: "Ir ao máximo" }).click();
  await expect(
    page
      .getByRole("table", { name: "Esforços na seção consultada" })
      .locator(".governing-force")
      .last(),
  ).toHaveText("40");
  await page
    .locator(".explorer")
    .getByRole("button", { name: "B1", exact: true })
    .click();
  await page.getByLabel("qZ global", { exact: true }).fill("-20");
  await page.getByLabel("qZ global", { exact: true }).press("Enter");
  await expect(
    page.getByRole("table", { name: "Esforços na seção consultada" }),
  ).toHaveCount(0);
  await expect(page.locator(".section-cursor")).toHaveCount(0);
});

test("salva e reabre o corte físico, consulta os dois lados e invalida após edição do modelo", async ({
  page,
}) => {
  await bridge(page);
  await page.goto("/");
  const button = (name: string) =>
    page.getByRole("button", { name, exact: true });
  await page.getByRole("button", { name: /Viga de referência/ }).click();
  await button("Analisar").click();
  await expect(page.getByRole("status")).toContainText("Análise concluída");
  const open = async () => {
    await button("Análise").click();
    await button("Cortes da estrutura").click();
  };
  await open();
  const dialog = page.getByRole("dialog", { name: "Cortes da estrutura" });
  await dialog.getByLabel("Nome do corte").fill("S1");
  await dialog.getByLabel("Ponto do plano X").fill("1,5");
  await dialog.getByLabel("Ponto de redução O X").fill("1,5");
  const total = dialog.getByRole("row", { name: /^Total/ });
  await expect(total.getByRole("cell").nth(2)).toHaveText("-15");
  await expect(dialog.locator('svg [data-object="V1"]')).toHaveAttribute(
    "data-hit",
    "true",
  );
  await dialog.getByLabel("Lado retido").selectOption("positive");
  await expect(total.getByRole("cell").nth(2)).toHaveText("15");
  await dialog.getByRole("button", { name: "Salvar corte" }).click();
  await expect(total.getByRole("cell").nth(2)).toHaveText("15");
  await dialog.getByRole("button", { name: "Fechar" }).click();
  await button("Desfazer").click();
  await button("Refazer").click();
  await open();
  await expect(total.getByRole("cell").nth(2)).toHaveText("15");
  await dialog.getByRole("button", { name: "Fechar" }).click();
  const stored = await page.evaluate(
    () => localStorage.getItem("kstruct.draft.v33")!,
  );
  const project = parseProject(stored);
  expect(project.sectionCuts![0]).toMatchObject({
    name: "S1",
    retained: "positive",
    point: { x: 1.5 },
  });
  project.nodes[1].x = 1;
  await openProjectInBrowser(
    page,
    "viga-editada.kstruct.json",
    serializeProject(project),
  );
  await open();
  await expect(dialog.getByText("Corte vazio.")).toBeVisible();
  await expect(dialog.getByText(/Analise os casos pendentes/)).toBeVisible();
  await expect(total).toHaveCount(0);
});

test("KS-50 · consulta a corda, muda a unidade e reabre a medida salva", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const executable = process.env.OOFEM_BIN;
  if (executable)
    await page.exposeFunction("solveQueueDeck", (deck: string) =>
      runDeck(deck, executable),
    );
  await bridge(page, { realSolver: !!executable });
  await page.goto("/");
  const button = (name: string) =>
    page.getByRole("button", { name, exact: true });
  await page.getByRole("button", { name: /Viga de referência/ }).click();
  await button("Analisar").click();
  await expect(page.getByRole("status")).toContainText("Análise concluída");
  const open = async () => {
    await button("Análise").click();
    await button("Medidas de serviço").click();
  };
  const dialog = page.getByRole("dialog", { name: "Medidas de serviço" });
  const table = dialog.getByRole("table", { name: "Resultados da medida" });
  const close = () => button("Fechar medidas").click();
  await open();
  const kind = dialog.getByRole("combobox", { name: "Tipo de medida" });
  await kind.selectOption("drift");
  await expect(dialog.getByRole("alert")).toContainText("Altura nula");
  await expect(button("Salvar medida")).toBeDisabled();
  await kind.selectOption("chord");
  await dialog
    .getByRole("combobox", { name: "Direção global" })
    .selectOption("z");
  const relative = table.getByRole("row").nth(1).getByRole("cell").last();
  await expect(relative).toHaveText("-8,4375");
  await expect(dialog).toContainText("Revisão");
  await expect(dialog).toContainText("B1");
  await expect(dialog).toContainText("6 m");
  await dialog
    .getByRole("textbox", { name: "Nome da medida" })
    .fill("Flecha central");
  await button("Salvar medida").click();
  await expect(dialog.getByRole("status")).toContainText("Medida salva");
  await expect(relative).toHaveText("-8,4375");
  await close();
  await button("Exibição").click();
  await button("Unidades").click();
  await page
    .getByRole("dialog", { name: "Unidades" })
    .getByRole("combobox", { name: "Deslocamentos", exact: true })
    .selectOption("cm");
  await button("Aplicar unidades").click();
  await open();
  await expect(table).toContainText("Relativo (cm)");
  await expect(relative).toHaveText("-0,84375");
  await close();

  await page.evaluate(() => Object.assign(window, { isTauri: false }));
  const download = page.waitForEvent("download");
  await button("Salvar projeto").click();
  const saved = await readFile((await (await download).path())!, "utf8");
  expect(parseProject(saved).serviceMeasures).toMatchObject([
    {
      name: "Flecha central",
      kind: "chord",
      memberId: "V1",
      axis: "z",
      t: 0.5,
      source: { kind: "case", id: "EL" },
    },
  ]);
  await openProjectInBrowser(page, "medida.kstruct.json", saved);
  await open();
  await expect(
    dialog.getByRole("textbox", { name: "Nome da medida" }),
  ).toHaveValue("Flecha central");
  await expect(dialog.getByRole("status")).toContainText("casos pendentes");
  await expect(table).toHaveCount(0);
});
