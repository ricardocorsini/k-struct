import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export function runDeck(deck: string, executable: string) {
  const dir = mkdtempSync(join(tmpdir(), "kstruct-test-"));
  try {
    writeFileSync(join(dir, "analysis.in"), deck);
    execFileSync(resolve(executable), ["-f", "analysis.in"], {
      cwd: dir,
      timeout: 30000,
      maxBuffer: 32 * 1024 * 1024,
    });
    return readFileSync(join(dir, "analysis.out"), "utf8");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
