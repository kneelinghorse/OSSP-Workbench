# Getting Started

## Two-Repo / Submodule Layout

- Ops repo (private): `missions/`, `docs/`, `PROJECT_CONTEXT.json`, `missions/current.yaml`, `missions/backlog.yaml`
- App repo (public/private): mounted at `app/` as a Git submodule; all shippable code lives here

### Workflow
- Build and commit inside `app/`, then push to the app remote (e.g., `main`)
- Commit ops changes (missions/docs/context) in the parent repo
- Clone with submodules: `git submodule update --init --recursive`

For details on sprint planning and mission flow, see `missions/` and `PROJECT_CONTEXT.json`.

### Sprint Source of Truth
- Per sprint, the canonical files are:
  - `missions/sprint-XX/build_sprint.XX.yaml` (build; required)
  - `missions/sprint-XX/research_sprint.XX.yaml` (research; optional)
- The sprint backlog derives from `build_sprint.XX.yaml` — do not treat templates or schemas as authoritative.
- AI handoff is consolidated into `missions/current.yaml` (instructions + completionProtocol) and `PROJECT_CONTEXT.json` (state/continuity). No separate handoff files are used.

Example (Sprint 01):
- Build: `missions/sprint-01/build_sprint.01.yaml`
- Research: `missions/sprint-01/research_sprint.01.yaml`

### Templates Available
- Conventions: `docs/conventions.sprint-files.md`
