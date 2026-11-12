# Polywar

Full scale low poly war game on papit. Second goal: every system is a small, decoupled package that could later move into papit (grass, terrain, city builder, animal AI, explosion, ...).

## Start here
- `.claude/plan.md`: current confirmed tasks. "Where we are" says what's next.
- `.claude/facts.md`: lasting knowledge (pipelines, conventions, how systems fit). Read the part you need.
- `.claude/backlog.md`: everything else, grouped by feature/bug (incl. paused tasks, papit reports). Don't read it unless needed.
- `.claude/bugs.md`: known bugs + workarounds (create when first needed).

## How we work
- Always a summarised plan before work; owner confirms. "next task" runs until no tasks left (or the given count), one line status per task.
- Feature branches by default, local merge to `main` allowed. Owner may say "do it on main": no branch, no PR.
- "prepare PR": cleanup, remove done tasks from plan, tick backlog, open GitHub PR. Praise like "great job" = ask before cleaning up `plan.md`.
- No subagents. No tests unless asked.
- New packages only via `npm run create` (`@papit/create`). Each package has `views/` to be seen alone in the dev server.
- Decouple: one concern per package, config/callbacks over hardcoded game logic. Game specifics live in the game package only.
- No runtime deps outside papit without asking.
- Hosted on GitHub Pages via `@papit/static`.

## Package folders
One rule per folder; put a new package where its role says.

| folder | holds |
| --- | --- |
| `packages/library/` | the asset library: `catalog` (`@polywar/assets`, the one gallery of all assets), materials, grass, city, building-builder, characters |
| `packages/ui/game/` | game UI (lobby, room, share) |
| `packages/ui/viewport/` | viewing: viewport-camera (controllers), 3d-demo stage, asset preview, gallery, renderer |
| `packages/utils/` | offline/dev tools and pure helpers (bakers, exporters, noise) |
| `packages/network/` | networking |
| `packages/animation/` | skeleton: rigs, IK, clips, bone drawing |

## Assets
All assets live in root `assets/` (models, audio, textures, animations) so the owner edits them in one place. Packages reference them, never copy. Target format glTF 2.0 (rigged, animations baked in the file).

## Papit
Repo `~/Developer/projects/papit`. Start with `.claude/CATALOG.md`, then READMEs. Trust code over docs. Papit bugs/missing pieces get reported to the owner, not patched here.
Key names: `engine`, `game-mesh` (mesh/skin/glTF), `armature` (FK/IK), `rigidbody`, `gjk`, `vector`, `matrix`, `quaternion`, `audio` (3D), `irregular-grid`, `game-network`, `web-component`.
Reference game: `~/Developer/games/arrow-warfare` (copy before writing new).
- `@papit/structure`: owner considers it bad, do not build on it.
