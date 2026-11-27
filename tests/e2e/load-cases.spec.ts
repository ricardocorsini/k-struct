import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { parseProject, serializeProject } from "../../src/domain/model";
import { exportOofem, parseOofemOutput } from "../../src/solver/oofem";
import { runDeck } from "../fixtures/solve-oofem";
import { spatialBenchmark } from "../fixtures/spatial-benchmark";

const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });

test("pórtico com casos vertical e vento Y salvos e consultados separadamente", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const portal = spatialBenchmark();
  portal.loadPatterns[0].nodal = [];
  portal.loadPatterns[0].uniform = [];
  await page.goto("/");
  const file = page.locator('input[type="file"]');
  await file.setInputFiles({
    name: "portico.kstruct.json",
    mimeType: "application/json",
    buffer: Buffer.from(serializeProject(portal)),
  });
  await expect(page.locator(".model-count")).toHaveText("9 nós · 11 barras");
  await button(page, "Cargas e casos").click();
  const editor = page.getByRole("dialog", {
    name: "Padrões, casos, combinações e envelopes",
  });
  await editor.getByRole("button", { name: "Novo padrão" }).click();
  await editor.getByLabel("Nome do padrão").fill("Vento Y");
  await editor.getByLabel("Padrão para editar").selectOption("G");
  await editor.getByRole("button", { name: "Excluir padrão" }).click();
  await expect(editor.getByRole("alert")).toContainText("O padrão está em uso");
  await editor
    .getByLabel("Padrão para editar")
    .selectOption({ label: "Vento Y" });
  await editor.getByRole("button", { name: "Casos estáticos" }).click();
  await editor.getByLabel("Nome do caso").fill("Vertical");
  await editor.getByRole("button", { name: "Novo caso" }).click();
  await editor.getByLabel("Nome do caso").fill("Vento lateral");
  await editor.getByRole("button", { name: "Adicionar parcela" }).click();
  await expect(editor.getByLabel("Padrão da parcela 2")).toHaveValue("G");
  await editor.getByRole("button", { name: "Remover parcela 2" }).click();
  const factor = editor.getByLabel("Fator da parcela 1");
  await factor.fill("");
  await editor.getByRole("button", { name: "Aplicar definições" }).click();
  await expect(editor.getByRole("alert")).toHaveText(
    "Informe fatores numéricos finitos no caso Vento lateral.",
  );
  await factor.fill("-0,75");
  await editor.getByRole("button", { name: "Aplicar definições" }).click();
  await expect(editor).not.toBeVisible();

  const casePicker = page.getByLabel("Caso, combinação ou envelope", {
    exact: true,
  });
  const patternPicker = page.getByLabel("Padrão de cargas", { exact: true });
  await button(page, "Desfazer").click();
  await expect(casePicker).toHaveValue("EL");
  await expect(patternPicker).toHaveValue("G");
  await button(page, "Refazer").click();
  await expect(casePicker.locator("option")).toHaveCount(2);
  await expect(patternPicker.locator("option")).toHaveCount(2);

  await patternPicker.selectOption("G");
  const explorer = page.locator(".explorer");
  await explorer.getByRole("button", { name: "B5", exact: true }).click();
  await page.getByLabel("qZ global").fill("-4,5");
  await page.getByLabel("qZ global").press("Enter");
  await patternPicker.selectOption({ label: "Vento Y" });
  await explorer.getByRole("button", { name: "N5", exact: true }).click();
  await page.getByLabel("Força Y", { exact: true }).fill("12");
  await page.getByLabel("Força Y", { exact: true }).press("Enter");

  const saved = page.waitForEvent("download");
  await button(page, "Salvar projeto").click();
  const path = (await (await saved).path())!;
  const model = parseProject(await readFile(path, "utf8"));
  const [permanent, wind] = model.loadPatterns;
  const [vertical, lateral] = model.analysisCases;
  expect(model.schemaVersion).toBe(33);
  expect(permanent.uniform).toMatchObject([{ memberId: "B5", qz: -4500 }]);
  expect(permanent.nodal).toEqual([]);
  expect(wind.nodal).toMatchObject([{ nodeId: "N5", fy: 12000 }]);
  expect(wind.uniform).toEqual([]);
  expect(vertical).toMatchObject({
    id: "EL",
    name: "Vertical",
    factors: [{ patternId: permanent.id, factor: 1 }],
  });
  expect(lateral).toMatchObject({
    name: "Vento lateral",
    factors: [{ patternId: wind.id, factor: -0.75 }],
  });

  await button(page, "Novo projeto").click();
  await page
    .getByRole("dialog", { name: "Novo projeto" })
    .getByRole("button", { name: "Criar projeto", exact: true })
    .click();
  await file.setInputFiles(path);
  await expect(casePicker).toHaveValue(vertical.id);
  await expect(casePicker.locator("option")).toHaveCount(2);
  await button(page, "Análise").click();
  const deckFor = async (id: string) => {
    await casePicker.selectOption(id);
    const exported = page.waitForEvent("download");
    await button(page, "Entrada OOFEM").click();
    const deck = await readFile((await (await exported).path())!, "utf8");
    expect(deck).toBe(exportOofem(model, id).deck);
    return deck;
  };
  const verticalDeck = await deckFor(vertical.id);
  const lateralDeck = await deckFor(lateral.id);
  expect(verticalDeck).toContain("ConstantEdgeLoad");
  expect(verticalDeck).not.toContain("NodalLoad");
  expect(lateralDeck).toContain("Components 6 0 -9000 0 0 0 0");
  expect(lateralDeck).not.toContain("ConstantEdgeLoad");

  if (process.env.OOFEM_BIN) {
    const entries = [
      { ...vertical, deck: verticalDeck },
      { ...lateral, deck: lateralDeck },
    ].map((entry) => ({
      ...entry,
      output: runDeck(entry.deck, process.env.OOFEM_BIN!),
    }));
    const [verticalResult, lateralResult] = entries.map(({ id, output }) =>
      parseOofemOutput(output, exportOofem(model, id)),
    );
    const reactionSum = (
      result: typeof verticalResult,
      component: "fy" | "fz",
    ) =>
      result.reactions.reduce((sum, reaction) => sum + reaction[component], 0);
    expect(reactionSum(verticalResult, "fz")).toBeCloseTo(
      4500 * Math.hypot(4.5, 3.5),
      -1,
    );
    expect(reactionSum(verticalResult, "fy")).toBeCloseTo(0, -1);
    expect(reactionSum(lateralResult, "fy")).toBeCloseTo(9000, -1);
    expect(reactionSum(lateralResult, "fz")).toBeCloseTo(0, -1);

    // Return the real outputs only to requests with their corresponding decks and names.
    await page.evaluate((cases) => {
      let nextCallback = 0;
      Object.assign(window, {
        isTauri: true,
        __TAURI_INTERNALS__: {
          transformCallback: () => ++nextCallback,
          invoke: async (
            command: string,
            args: {
              deck: string;
              runContext: Record<string, string>;
              response: { onmessage: (result: unknown) => void };
            },
          ) => {
            const match = cases.find(
              ({ deck, name }) =>
                deck === args.deck && name === args.runContext.caseName,
            );
            if (command !== "start_oofem" || !match)
              throw new Error("Entrada do caso divergente.");
            const total = Number(sessionStorage.getItem("e2e-case-runs") ?? 0);
            sessionStorage.setItem("e2e-case-runs", String(total + 1));
            args.response.onmessage({
              output: match.output,
              log: {
                summary: {
                  ...args.runContext,
                  status: "completed",
                  message: "OOFEM concluído.",
                },
              },
              historyError: null,
            });
          },
        },
      });
    }, entries);

    await page.getByLabel("Pavimento ativo").selectOption("level2");
    const diagram = page.getByLabel("Visualização dos resultados");
    const polygon = page.locator(".elevation polygon").first();
    await casePicker.selectOption(vertical.id);
    await button(page, "Analisar").click();
    await expect(page.getByRole("status")).toContainText(
      "Análise concluída · Vertical",
    );
    await diagram.selectOption("my");
    // Expanding the results pane can translate the viewport while the section forces stay the same.
    const diagramShape = () =>
      polygon.evaluate((element) => {
        const points = (element as SVGPolygonElement).points;
        const origin = points.getItem(0);
        return Array.from(points, (point) => [
          Math.round((point.x - origin.x) * 1000),
          Math.round((point.y - origin.y) * 1000),
        ]);
      });
    const verticalShape = await diagramShape();
    await casePicker.selectOption(lateral.id);
    await expect(diagram).toHaveValue("model");
    await button(page, "Analisar").click();
    await expect(page.getByRole("status")).toContainText(
      "Análise concluída · Vento lateral",
    );
    await diagram.selectOption("my");
    await expect.poll(diagramShape).not.toEqual(verticalShape);
    await casePicker.selectOption(vertical.id);
    await expect(diagram).toHaveValue("my");
    await expect.poll(diagramShape).toEqual(verticalShape);
    await expect(page.locator(".result-case-name")).toHaveText("Vertical");
    expect(
      await page.evaluate(() => sessionStorage.getItem("e2e-case-runs")),
    ).toBe("2");

    await page.evaluate(() => Object.assign(window, { isTauri: false }));
    await button(page, "Esforços").click();
    await page.getByLabel("Barra em Esforços").selectOption({ label: "B5" });
    const memberCells = page.getByRole("table").locator("tbody td:first-child");
    await expect(memberCells).toHaveText(
      Array(model.mesh.segmentsPerMember + 1).fill("B5"),
    );
    const csvDownload = page.waitForEvent("download");
    await button(page, "CSV").click();
    const csv = await readFile((await (await csvDownload).path())!, "utf8");
    expect(
      csv
        .split("\n")
        .slice(1)
        .map((row) => row.split(";")[0]),
    ).toEqual(Array(model.mesh.segmentsPerMember + 1).fill('"B5"'));
    expect(csv).toContain(
      '"N (kN)";"Vy (kN)";"Vz (kN)";"Mx (kN·m)";"My (kN·m)";"Mz (kN·m)"',
    );
    expect(csv).toContain('"Caso";"ID do caso"');
    expect(csv).toContain('"Vertical";"EL"');

    await button(page, "Cargas e casos").click();
    await editor.getByLabel("Fator da parcela 1").fill("2");
    await editor.getByRole("button", { name: "Aplicar definições" }).click();
    await expect(page.locator(".result-case-name")).toHaveCount(0);
    await casePicker.selectOption(lateral.id);
    await expect(diagram).toHaveValue("model");
    await expect(page.locator(".result-case-name")).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test("excluir definições é uma edição única e recuperável", async ({
  page,
}) => {
  await page.goto("/");
  await button(page, "Cargas e casos").click();
  const editor = page.getByRole("dialog", {
    name: "Padrões, casos, combinações e envelopes",
  });
  await editor.getByRole("button", { name: "Novo padrão" }).click();
  await editor.getByRole("button", { name: "Casos estáticos" }).click();
  await editor.getByRole("button", { name: "Novo caso" }).click();
  await editor.getByRole("button", { name: "Aplicar definições" }).click();
  const casePicker = page.getByLabel("Caso, combinação ou envelope", {
    exact: true,
  });
  const patternPicker = page.getByLabel("Padrão de cargas", { exact: true });
  const [caseId, patternId] = await Promise.all([
    casePicker.inputValue(),
    patternPicker.inputValue(),
  ]);
  await button(page, "Cargas e casos").click();
  await editor.getByRole("button", { name: "Casos estáticos" }).click();
  await editor.getByRole("button", { name: "Excluir caso" }).click();
  await editor.getByRole("button", { name: "Padrões de carga" }).click();
  await editor.getByRole("button", { name: "Excluir padrão" }).click();
  await editor.getByRole("button", { name: "Aplicar definições" }).click();
  await expect(casePicker).toHaveValue("EL");
  await expect(patternPicker).toHaveValue("G");
  await expect(casePicker.locator("option")).toHaveCount(1);
  await expect(patternPicker.locator("option")).toHaveCount(1);
  await button(page, "Desfazer").click();
  await casePicker.selectOption(caseId);
  await patternPicker.selectOption(patternId);
  await expect(casePicker.locator("option")).toHaveCount(2);
  await expect(patternPicker.locator("option")).toHaveCount(2);
});
