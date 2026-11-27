import { openProjectInBrowser } from "../fixtures/open-project";
import { expect, test, type Page } from "@playwright/test";
import { beamExample, serializeProject } from "../../src/domain/model";

const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });

test("edita e persiste peso próprio por padrão com contribuição por barra", async ({
  page,
}) => {
  const project = beamExample();
  project.materials[0].density = 2500;
  Object.assign(project.sections[0], { width: 0.2, height: 0.4 });
  project.loadPatterns[0].uniform = [];
  await page.goto("/");
  await openProjectInBrowser(
    page,
    "peso-proprio.kstruct.json",
    serializeProject(project),
  );
  await button(page, "Cargas e casos").click();
  const editor = page.getByRole("dialog", {
    name: "Padrões, casos, combinações e envelopes",
  });
  await editor.getByLabel("Ativar peso próprio no padrão").check();
  await editor.getByLabel("Gravidade do peso próprio").fill("10");
  await expect(editor).toContainText("B1: (0, 0, -2000) N/m");
  await expect(editor).toContainText("Total do padrão (barras e painéis):");
  await expect(editor).toContainText(
    "Total do padrão (barras e painéis): (0, 0, -12000) N",
  );
  await editor.getByRole("button", { name: "Aplicar definições" }).click();
  await expect(editor).toHaveCount(0);
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("kstruct.draft.v33")!),
  );
  expect(saved.loadPatterns[0].selfWeight).toMatchObject({
    enabled: true,
    direction: "-Z",
    gravity: 10,
    multiplier: 1,
  });
});
