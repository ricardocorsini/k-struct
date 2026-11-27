import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  beamExample,
  defaultEndConnection,
  parseProject,
  serializeProject,
  type EndConnection,
} from "../../src/domain/model";

import { planarTruss, spatialBrace } from "../fixtures/member-hinges";
import { openProjectInBrowser } from "../fixtures/open-project";
import { analyzeInBrowser } from "../fixtures/analyze-in-browser";
import { hingeMemberEnds } from "../../src/domain/editing";

test("edita, representa e salva ligações independentes nas pontas i/j", async ({
  page,
}) => {
  const project = beamExample();
  const connectionI: EndConnection = defaultEndConnection();
  connectionI.ry = { kind: "free" };
  const connectionJ: EndConnection = defaultEndConnection();
  connectionJ.ry = { kind: "elastic", stiffness: 2400 };
  project.members[0].connectionI = connectionI;
  project.members[0].connectionJ = connectionJ;

  await page.addInitScript(
    (source) => localStorage.setItem("kstruct.draft.v31", source),
    serializeProject(project),
  );
  await page.goto("/");
  await page
    .locator(".explorer")
    .getByRole("button", { name: "B1", exact: true })
    .click();

  const iRotation = page.getByRole("combobox", { name: "Ligação i · Ry" });
  const jRotation = page.getByRole("combobox", { name: "Ligação j · Ry" });
  await expect(iRotation).toHaveValue("free");
  await expect(jRotation).toHaveValue("elastic");
  await expect(page.getByLabel("Rigidez j · Ry")).toHaveValue("2.4");
  for (const end of ["i", "j"] as const) {
    await expect(
      page.locator(
        `g.connection-release-marker[data-member-connection-end="${end}"]`,
      ),
    ).toBeVisible();
    await expect(
      page.locator(
        `span.scene-connection-release[data-member-connection-end="${end}"]`,
      ),
    ).toBeVisible();
  }

  await iRotation.selectOption("elastic");
  const field = page.getByLabel("Rigidez i · Ry");
  await field.fill("4,2");
  await field.press("Enter");
  const saving = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Salvar projeto", exact: true })
    .click();
  const savedDownload = await saving;
  const saved = parseProject(
    await readFile((await savedDownload.path())!, "utf8"),
  );
  expect(saved.members[0].connectionI?.ry).toEqual({
    kind: "elastic",
    stiffness: 4200,
  });
  expect(saved.members[0].connectionJ?.ry).toEqual({
    kind: "elastic",
    stiffness: 2400,
  });
});

test("articula a treliça em lote, analisa, desfaz em um passo e reabre o projeto", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const project = planarTruss();
  const expected = structuredClone(project);
  hingeMemberEnds(expected, new Set(["V1", "AC", "BC"]));
  const button = (name: string) =>
    page.getByRole("button", { name, exact: true });
  await page.goto("/");
  await openProjectInBrowser(
    page,
    "trelica.kstruct.json",
    serializeProject(project),
  );
  const explorer = page.locator(".explorer");
  await explorer.getByRole("button", { name: "B1", exact: true }).click();
  for (const name of ["AC", "BC"]) {
    await explorer
      .getByRole("button", { name, exact: true })
      .click({ modifiers: ["Control"] });
  }
  await button("Articular as duas extremidades").click();
  const releases = page.locator("svg .connection-release-marker");
  await expect(releases).toHaveCount(6);
  await button("Articular as duas extremidades").click();

  if (process.env.OOFEM_BIN) {
    await analyzeInBrowser(page, expected, process.env.OOFEM_BIN);
    await button("Reações").click();
    await expect(
      page.getByRole("cell", { name: "5", exact: true }),
    ).toHaveCount(2);
  }

  await button("Desfazer").click();
  await expect(releases).toHaveCount(0);
  await expect(button("Desfazer")).toBeDisabled();
  await expect(page.getByLabel("Visualização dos resultados")).toHaveValue(
    "model",
  );
  await button("Refazer").click();
  await expect(releases).toHaveCount(6);
  const download = page.waitForEvent("download");
  await button("Salvar projeto").click();
  const saved = await readFile((await (await download).path())!, "utf8");
  expect(parseProject(saved)).toEqual(expected);
  await openProjectInBrowser(page, "trelica-articulada.kstruct.json", saved);
  await expect(releases).toHaveCount(6);
});

test("articula uma barra espacial e indica a ponta livre à torção", async ({
  page,
}) => {
  const project = spatialBrace();
  await page.goto("/");
  await openProjectInBrowser(
    page,
    "portico.kstruct.json",
    serializeProject(project),
  );
  const explorer = page.locator(".explorer");
  await explorer.getByRole("button", { name: "BC", exact: true }).click();
  await expect(
    page.getByText("Libera Ry e Rz nas duas pontas e Rx somente em i.", {
      exact: false,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Articular as duas extremidades",
      exact: true,
    })
    .click();
  await expect(page.getByLabel("Ligação i · Rx", { exact: true })).toHaveValue(
    "free",
  );
  await expect(page.getByLabel("Ligação j · Rx", { exact: true })).toHaveValue(
    "rigid",
  );
  for (const dof of ["Ry", "Rz"])
    for (const end of ["i", "j"])
      await expect(
        page.getByLabel(`Ligação ${end} · ${dof}`, { exact: true }),
      ).toHaveValue("free");
  await explorer.getByRole("button", { name: "B1", exact: true }).click();
  await expect(page.getByLabel("Ligação j · Ry", { exact: true })).toHaveValue(
    "rigid",
  );
});
