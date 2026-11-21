// Solano Heat — hand-in program for make.fun's "Make GTA 6" bounty (gta6-01).
//
// Copies the playable game (game/) and its screenshots (screenshots/) into the
// output directory, then writes dossier.json with the kit's own library, so the
// dossier matches byte for byte what the scorer rebuilds from those same files.
// Node 22, standard library only; two runs hand in exactly the same bytes.
import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoDir = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Start from an empty directory: leftovers from an earlier run would change
// the bytes handed in, so the output is rebuilt from scratch every time.
// Clear the contents only — the grader's output dir is mounted with a
// read-only parent, so removing the directory itself fails with EPERM
// for the unprivileged grader user.
mkdirSync(outDir, { recursive: true });
for (const entry of readdirSync(outDir)) {
  rmSync(join(outDir, entry), { recursive: true, force: true });
}
cpSync(join(repoDir, 'game'), join(outDir, 'game'), { recursive: true });
cpSync(join(repoDir, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });

// The caps are the bounty's own gate numbers, so this program refuses exactly
// where the scorer would: source text 160 KiB, at most 4 screenshots of
// 256 KiB, at most 993 game entries and 48 MiB, paths of at most 1000 bytes.
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
