import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { planeCoordinates, type PlaneKind } from "../../src/domain/geometry";
import { parseProject } from "../../src/domain/model";
import { exportOofem, parseOofemOutput } from "../../src/solver/oofem";
import { runDeck } from "../fixtures/solve-oofem";
import {
  spatialBenchmark,
  spatialBenchmarkDifferences,
} from "../fixtures/spatial-benchmark";

async function clickGrid(
  page: Page,
  kind: PlaneKind,
  u: number,
  v: number,
  options: { shift?: boolean; rise?: number } = {},
) {
  const [axisU, axisV] = planeCoordinates[kind];
  const drawing = page.getByRole("application", {
    name: `Área de lançamento ${kind}`,
  });
  const position = await drawing.evaluate(
    (svg, { axisU, axisV, u, v, rise }) => {
      const line = (axis: string, value: number) =>
        svg.querySelector<SVGLineElement>(
          `line[data-axis="${axis}"][data-position="${value}"]`,
        )!;
      const y = (value: number) =>
        Number(line(axisV, value).getAttribute("y1"));
      const correction = rise ? ((y(0) - y(3.5)) / 3.5) * rise : 0;
      return {
        x: Number(line(axisU, u).getAttribute("x1")),
        y: y(v) - correction,
      };
    },
    { axisU, axisV, u, v, rise: options.rise },
  );
  await drawing.click({ position, modifiers: options.shift ? ["Shift"] : [] });
}

test("pórtico espacial assimétrico lançado do vazio, salvo e conferido com a referência", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Novo pórtico espacial" }).click();
  await page.getByRole("button", { name: "Eixos e pavimentos" }).click();
  const dialog = page.getByRole("dialog", { name: "Eixos e pavimentos" });
  await dialog.getByLabel("Posição da referência 2").fill("4,5");
  await dialog.getByRole("button", { name: "Eixos Y", exact: true }).click();
  await dialog.getByLabel("Posição da referência 2").fill("3,5");
  await dialog.getByRole("button", { name: "Pavimentos", exact: true }).click();
  await dialog.getByLabel("Posição da referência 2").fill("2,8");
  await dialog.getByRole("button", { name: "Aplicar referências" }).click();

  const level = page.getByLabel("Pavimento ativo");
  const plane = page.getByLabel("Plano de trabalho");
  const bar = page.getByRole("button", { name: /^Barra/ });
  const frame = page.locator(".explorer");
  const object = (name: string) =>
    frame.getByRole("button", { name, exact: true });
  await level.selectOption("level1");
  await expect(
    page.getByRole("button", { name: "Orto", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await bar.click();
  await clickGrid(page, "XY", 0, 0);
  await clickGrid(page, "XY", 4.5, 0, { rise: 0.65 });
  await clickGrid(page, "XY", 0, 0);
  await clickGrid(page, "XY", 0, 3.5);

  await object("B1").click();
  await object("B2").click({ modifiers: ["Control"] });
  await expect(
    page.getByRole("heading", { name: "Seleção múltipla" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Replicar", exact: true }).click();
  const replica = page.getByRole("dialog", { name: "Replicar seleção" });
  await expect(replica.getByLabel("ΔZ (m)")).toHaveValue("3.2");
  await replica.getByRole("button", { name: "Criar cópias" }).click();

  await level.selectOption("level2");
  await bar.click();
  await clickGrid(page, "XY", 4.5, 0);
  await clickGrid(page, "XY", 0, 3.5, { shift: true });

  await plane.selectOption("XZ");
  await clickGrid(page, "XZ", 0, 0);
  await clickGrid(page, "XZ", 0, 2.8);
  await clickGrid(page, "XZ", 0, 2.8);
  await clickGrid(page, "XZ", 0, 6);
  await clickGrid(page, "XZ", 4.5, 0);
  await clickGrid(page, "XZ", 4.5, 2.8);
  await clickGrid(page, "XZ", 4.5, 2.8);
  await clickGrid(page, "XZ", 4.5, 6);
  await plane.selectOption("YZ");
  await clickGrid(page, "YZ", 3.5, 0);
  await clickGrid(page, "YZ", 3.5, 2.8);
  await clickGrid(page, "YZ", 3.5, 2.8);
  await clickGrid(page, "YZ", 3.5, 6);
  await expect(page.locator(".model-count")).toHaveText("9 nós · 11 barras");

  await plane.selectOption("XY");
  await page.getByRole("button", { name: "Selecionar plano" }).click();
  await page.getByRole("button", { name: "Engastar nós" }).click();
  await expect(frame.getByRole("button", { name: /Apoio/ })).toHaveCount(3);

  const set = async (label: string, value: string) => {
    const field = page.getByLabel(label, { exact: true });
    await field.fill(value);
    await field.press("Enter");
  };
  await object("B5").click();
  await set("Rotação em torno de x local", "27");
  await set("qX global", "0,8");
  await set("qY global", "-1,3");
  await set("qZ global", "-4,5");
  await object("N5").click();
  await set("Força Y", "12");
  await set("Força Z", "-8");
  await set("Momento X", "0,4");
  await set("Momento Z", "-0,3");

  const saveEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Salvar projeto", exact: true })
    .click();
  const savedPath = await (await saveEvent).path();
  const model = parseProject(await readFile(savedPath!, "utf8"));
  const reference = spatialBenchmark();
  expect(model.nodes.map((n) => [n.name, n.x, n.y, n.z, n.restraints])).toEqual(
    reference.nodes.map((n) => [n.name, n.x, n.y, n.z, n.restraints]),
  );
  const byNames = new Map(model.nodes.map((n) => [n.id, n.name]));
  expect(
    model.members.map((m) => ({
      ...m,
      id: m.name,
      start: byNames.get(m.start),
      end: byNames.get(m.end),
    })),
  ).toEqual(reference.members);
  expect(
    model.loadPatterns[0].nodal.map((l) => ({
      ...l,
      nodeId: byNames.get(l.nodeId),
    })),
  ).toEqual(reference.loadPatterns[0].nodal);
  expect(
    model.loadPatterns[0].uniform.map((l) => ({
      ...l,
      memberId: model.members.find((m) => m.id === l.memberId)!.name,
    })),
  ).toEqual(reference.loadPatterns[0].uniform);
  expect(model.guides.x[1].position).toBe(4.5);
  expect(model.guides.z[1].position).toBe(2.8);

  await page.getByRole("button", { name: "Novo projeto", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles(savedPath!);
  await expect(page.locator(".model-count")).toHaveText("9 nós · 11 barras");
  await expect(
    page.getByLabel("Pavimento ativo").locator("option").nth(1),
  ).toContainText("2.8 m");
  await page.getByRole("button", { name: "Análise", exact: true }).click();
  const exported = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Entrada OOFEM", exact: true })
    .click();
  const deck = await readFile((await (await exported).path())!, "utf8");
  const input = exportOofem(model, "EL");
  expect(deck).toBe(input.deck);
  expect(deck).toContain("domain 3dShell");
  if (process.env.OOFEM_BIN) {
    const output = runDeck(deck, process.env.OOFEM_BIN);
    expect(
      spatialBenchmarkDifferences(model, parseOofemOutput(output, input)),
    ).toEqual([]);
    // Deliver the real solver output through the IPC boundary in the browser.
    await page.evaluate(
      ({ deck, output }) => {
        Object.assign(window, {
          isTauri: true,
          __TAURI_INTERNALS__: {
            transformCallback: () => 1,
            invoke: async (
              cmd: string,
              args: {
                deck: string;
                runContext: Record<string, string>;
                response: { onmessage: (value: unknown) => void };
              },
            ) => {
              if (cmd !== "start_oofem" || args.deck !== deck)
                throw new Error("Entrada de análise diferente da exportada.");
              args.response.onmessage({
                output,
                log: {
                  summary: {
                    ...args.runContext,
                    status: "completed",
                    message: "OOFEM concluído.",
                  },
                },
              });
            },
          },
        });
      },
      { deck, output },
    );
    await page.getByRole("button", { name: "Analisar", exact: true }).click();
    await expect(page.getByRole("status")).toContainText(
      "Equilíbrio global verificado",
    );
    await expect(page.getByLabel("Visualização dos resultados")).toHaveValue(
      "deformed",
    );
    await level.selectOption("level2");
    await expect(page.locator(".elevation polyline")).toHaveCount(3);
    await page.getByRole("button", { name: "Esforços", exact: true }).click();
    await expect(
      page.getByRole("columnheader", { name: "Mx (kN·m)" }),
    ).toBeVisible();
    await page.getByLabel("Visualização dos resultados").selectOption("mz");
    await expect(page.locator(".elevation polygon")).toHaveCount(3);
    await page
      .getByRole("button", { name: "Deslocamentos", exact: true })
      .click();
    await expect(
      page.getByRole("columnheader", { name: "UY (mm)" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Reações", exact: true }).click();
    await expect(
      page.getByRole("columnheader", { name: "RY (kN)" }),
    ).toBeVisible();
  }
  expect(errors).toEqual([]);
});
