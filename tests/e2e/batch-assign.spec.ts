import { test, expect } from "@playwright/test";
import {
  beamExample,
  nodalLoad,
  serializeProject,
  type Project,
} from "../../src/domain/model";
import { analyzeInBrowser } from "../fixtures/analyze-in-browser";
import { inclinedBeam } from "../fixtures/inclined-beam";
import { duplicateSection } from "../../src/domain/materials";

test("atribuição em lote: somar, substituir, remover cargas, seleção mista e undo", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");

  // Gerar viga contínua com 2 barras via Novo projeto
  await page.getByRole("button", { name: "Novo projeto", exact: true }).click();
  const newDialog = page.getByRole("dialog", { name: "Novo projeto" });
  await newDialog
    .getByRole("button", { name: "Viga contínua", exact: true })
    .click();
  await newDialog
    .getByRole("button", { name: "Gerar projeto", exact: true })
    .click();
  await expect(page.locator(".model-count")).toHaveText("3 nós · 2 barras");

  const explorer = page.locator(".explorer");
  await explorer.getByRole("button", { name: "B1", exact: true }).click();
  await page.getByLabel("qX global").fill("1,5");
  await page.getByLabel("qX global").press("Tab");
  await page.getByLabel("qZ global").fill("-2");
  await page.getByLabel("qZ global").press("Tab");

  await explorer.getByRole("button", { name: "B2", exact: true }).click();
  await page.getByLabel("qZ global").fill("-3");
  await page.getByLabel("qZ global").press("Tab");

  // Selecionar B1 e B2 -> Somar -1 kN/m em qZ
  await explorer.getByRole("button", { name: "B1", exact: true }).click();
  await explorer
    .getByRole("button", { name: "B2", exact: true })
    .click({ modifiers: ["Control"] });

  const batch = page.getByRole("region", { name: "Atribuição em lote" });
  await expect(batch).toBeVisible();

  // Campo inválido bloqueia aplicação e Cancelar limpa rascunho
  const lotQz = batch.getByLabel("Lote qZ");
  await lotQz.fill("abc");
  await expect(lotQz).toHaveAttribute("aria-invalid", "true");
  await expect(
    batch.getByRole("button", { name: "Aplicar lote", exact: true }),
  ).toBeDisabled();
  await batch.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(lotQz).toHaveValue("");

  // Somar -1 kN/m
  await lotQz.fill("-1");
  await expect(batch.getByLabel("Prévia da atribuição em lote")).toContainText(
    "somar qZ = -1 kN/m",
  );
  await batch
    .getByRole("button", { name: "Aplicar lote", exact: true })
    .click();

  await explorer.getByRole("button", { name: "B1", exact: true }).click();
  await expect(page.getByLabel("qZ global")).toHaveValue("-3");
  await explorer.getByRole("button", { name: "B2", exact: true }).click();
  await expect(page.getByLabel("qZ global")).toHaveValue("-4");

  // Um único Desfazer reverte todo o lote e Refazer restaura
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await explorer.getByRole("button", { name: "B1", exact: true }).click();
  await expect(page.getByLabel("qZ global")).toHaveValue("-2");
  await explorer.getByRole("button", { name: "B2", exact: true }).click();
  await expect(page.getByLabel("qZ global")).toHaveValue("-3");
  await page.getByRole("button", { name: "Refazer", exact: true }).click();
  await explorer.getByRole("button", { name: "B1", exact: true }).click();
  await expect(page.getByLabel("qZ global")).toHaveValue("-3");

  // Substituir por -5 e depois remover qZ preservando qX de B1
  await explorer.getByRole("button", { name: "B1", exact: true }).click();
  await explorer
    .getByRole("button", { name: "B2", exact: true })
    .click({ modifiers: ["Control"] });
  await batch
    .getByLabel("Operação de carga distribuída")
    .selectOption("replace");
  await batch.getByLabel("Lote qZ").fill("-5");
  await batch
    .getByRole("button", { name: "Aplicar lote", exact: true })
    .click();

  await explorer.getByRole("button", { name: "B2", exact: true }).click();
  await expect(page.getByLabel("qZ global")).toHaveValue("-5");

  await explorer.getByRole("button", { name: "B1", exact: true }).click();
  await explorer
    .getByRole("button", { name: "B2", exact: true })
    .click({ modifiers: ["Control"] });
  await batch
    .getByLabel("Operação de carga distribuída")
    .selectOption("remove");
  await batch.getByLabel("Remover qZ").check();
  await batch
    .getByRole("button", { name: "Aplicar lote", exact: true })
    .click();

  await explorer.getByRole("button", { name: "B1", exact: true }).click();
  await expect(page.getByLabel("qX global")).toHaveValue("1.5");
  await expect(page.getByLabel("qZ global")).toHaveValue("0");

  // Seleção mista: restringir UZ em N1 e N2 mantendo N3 livre
  await explorer.getByRole("button", { name: "N1", exact: true }).click();
  await explorer
    .getByRole("button", { name: "N2", exact: true })
    .click({ modifiers: ["Control"] });
  await explorer
    .getByRole("button", { name: "B1", exact: true })
    .click({ modifiers: ["Control"] });
  await batch.getByLabel("Apoio em lote uz").selectOption("restrict");
  await batch
    .getByRole("button", { name: "Aplicar lote", exact: true })
    .click();

  await explorer.getByRole("button", { name: "N1 Apoio", exact: true }).click();
  await expect(page.getByLabel("Restringir uz")).toBeChecked();
  await expect(page.getByLabel("Restringir ux")).not.toBeChecked();
  await explorer.getByRole("button", { name: "N3", exact: true }).click();
  await expect(page.getByLabel("Restringir uz")).not.toBeChecked();
  expect(errors).toEqual([]);
});

for (const mode of ["planar", "spatial"] as const) {
  test(`grupo misto em ${mode} identifica os referenciais e desfaz o lote inteiro`, async ({
    page,
  }) => {
    const p = beamExample();
    p.mode = mode;
    const section = duplicateSection(p, "rect");
    p.nodes[1].supportFrame =
      mode === "planar"
        ? { kind: "planar", angle: -30 }
        : {
            kind: "spatial",
            x: { x: 0, y: 2, z: 0 },
            y: { x: 0, y: 1, z: 4 },
          };
    p.selectionGroups.push({
      id: "grp",
      name: "Vão",
      objects: [
        { kind: "node", id: "A" },
        { kind: "node", id: "B" },
        { kind: "member", id: "V1" },
      ],
    });
    p.loadPatterns.push({
      id: "Q",
      name: "Sobrecarga",
      nodal: [{ ...nodalLoad("B"), fz: -2387 }],
      uniform: [],
      pressure: [],
      selfWeight: { ...p.loadPatterns[0].selfWeight },
    });
    await page.addInitScript(
      (source) => localStorage.setItem("kstruct.draft.v31", source),
      serializeProject(p),
    );
    await page.goto("/");
    const button = (name: string) =>
      page.getByRole("button", { name, exact: true });
    const draft = (): Promise<Project> =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("kstruct.draft.v33")!),
      );
    await button("Seleção e grupos").click();
    const dialog = page.getByRole("dialog", { name: "Seleção e grupos" });
    await dialog.getByLabel("Grupo salvo").selectOption("grp");
    await dialog.getByRole("button", { name: "Recuperar grupo" }).click();
    const batch = page.getByRole("region", { name: "Atribuição em lote" });
    const preview = batch.getByLabel("Prévia da atribuição em lote");
    await batch.getByLabel("Apoio em lote uz").selectOption("release");
    await batch.getByLabel("Seção em lote").selectOption(section);
    await batch.getByLabel("Lote Força Z").fill("-1,25");
    await preview
      .getByText("Referenciais dos nós selecionados", { exact: true })
      .click();
    await expect(
      preview.getByText("N1 · Global", { exact: true }),
    ).toBeVisible();
    const local =
      mode === "planar"
        ? "N2 · Local · tangente a -30° em XZ"
        : "N2 · Local · x = (0 / 1 / 0), y = (0 / 0 / 1), z = (1 / 0 / 0)";
    await expect(preview.getByText(local, { exact: true })).toBeVisible();
    await preview.getByText("Objetos afetados", { exact: true }).click();
    await expect(
      preview.getByText("Barras · B1", { exact: true }),
    ).toBeVisible();
    await expect(
      preview.getByText("Nós · N1, N2", { exact: true }),
    ).toBeVisible();
    await expect(button("Desfazer")).toBeDisabled();
    await batch.getByRole("button", { name: "Aplicar lote" }).click();
    const expected = structuredClone(p);
    expected.members[0].sectionId = section;
    for (const n of expected.nodes) {
      n.restraints.uz = false;
      expected.loadPatterns[0].nodal.push({ ...nodalLoad(n.id), fz: -1250 });
    }
    await expect.poll(draft).toEqual(expected);
    await button("Desfazer").click();
    await expect.poll(draft).toEqual(p);
    await expect(button("Desfazer")).toBeDisabled();
    await button("Refazer").click();
    await expect.poll(draft).toEqual(expected);
    await page
      .locator(".explorer")
      .getByRole("button", { name: /^N2/ })
      .click();
    await expect(page.getByLabel("Referencial do apoio")).toHaveValue("local");
    await expect(page.getByLabel("Restringir uz local")).not.toBeChecked();
    await expect(page.getByLabel("Força Z", { exact: true })).toHaveValue(
      "-1.25",
    );
  });
}

test("cargas globais em lote equilibram o rolete no modelo de referência", async ({
  page,
}) => {
  const p = inclinedBeam();
  await page.addInitScript(
    (source) => localStorage.setItem("kstruct.draft.v31", source),
    serializeProject(p),
  );
  await page.goto("/");
  const explorer = page.locator(".explorer");
  await explorer.getByRole("button", { name: /^N1/ }).click();
  await explorer
    .getByRole("button", { name: /^N2/ })
    .click({ modifiers: ["Control"] });
  await explorer
    .getByRole("button", { name: "B1", exact: true })
    .click({ modifiers: ["Control"] });
  const batch = page.getByRole("region", { name: "Atribuição em lote" });
  await batch
    .getByLabel("Operação de carga distribuída")
    .selectOption("replace");
  await batch.getByLabel("Lote qZ").fill("-5");
  await batch.getByLabel("Lote Força Z").fill("-1");
  await batch.getByRole("button", { name: "Aplicar lote" }).click();

  const manual = structuredClone(p);
  manual.loadPatterns[0].uniform[0].qz = -5000;
  manual.loadPatterns[0].nodal = manual.nodes.map((n) => ({
    ...nodalLoad(n.id),
    fz: -1000,
  }));
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("kstruct.draft.v33")!),
      ),
    )
    .toEqual(manual);
  if (process.env.OOFEM_BIN) {
    await analyzeInBrowser(page, manual, process.env.OOFEM_BIN);
    await page.getByRole("button", { name: "Reações", exact: true }).click();
    const rows = page.locator(".results-body tbody tr");
    const values = rows.filter({ hasText: "N2" }).getByRole("cell");
    await expect(values).toHaveText([
      "N2",
      "12",
      "16",
      "0",
      "0",
      "20",
      "0",
      "Local",
    ]);
    await expect(
      rows
        .filter({ hasText: "N1" })
        .getByRole("cell", { name: "-12", exact: true }),
    ).toHaveCount(2);
  }
});

test("o lote exibe e aplica forças, momentos e cargas nas unidades selecionadas", async ({
  page,
}) => {
  const p = inclinedBeam();
  await page.addInitScript((source) => {
    localStorage.setItem("kstruct.draft.v31", source);
    localStorage.setItem(
      "kstruct.units",
      JSON.stringify({ force: "N", moment: "N·m", distributedLoad: "N/m" }),
    );
  }, serializeProject(p));
  await page.goto("/");
  const explorer = page.locator(".explorer");
  await explorer.getByRole("button", { name: /^N1/ }).click();
  await explorer
    .getByRole("button", { name: "B1", exact: true })
    .click({ modifiers: ["Control"] });
  const panel = page.getByRole("region", { name: "Atribuição em lote" });
  await panel
    .getByLabel("Operação de carga distribuída")
    .selectOption("replace");
  await panel.getByLabel("Lote qZ").fill("-2500");
  await panel.getByLabel("Lote Força Z").fill("-750");
  await panel.getByLabel("Lote Momento Y").fill("150");
  await expect(panel).toContainText("qZ = -2500 N/m");
  await expect(panel).toContainText("FZ = -750 N");
  await expect(panel).toContainText("MY = 150 N·m");
  await panel.getByRole("button", { name: "Aplicar lote" }).click();
  await explorer.getByRole("button", { name: "B1", exact: true }).click();
  await expect(page.getByLabel("qZ global")).toHaveValue("-2500");
  await explorer.getByRole("button", { name: /^N1/ }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const pattern = JSON.parse(localStorage.getItem("kstruct.draft.v33")!)
          .loadPatterns[0];
        return [
          pattern.uniform[0].qz,
          pattern.nodal[0].fz,
          pattern.nodal[0].my,
        ];
      }),
    )
    .toEqual([-2500, -750, 150]);
});
