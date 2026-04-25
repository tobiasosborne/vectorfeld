# CLAUDE.md

## Workflow Orchestration

### 1. Plan Mode Default

- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions).
- If something goes sideways, STOP and re-plan immediately — don't keep pushing.
- Use plan mode for verification steps, not just building.
- Write detailed specs upfront to reduce ambiguity.

### 2. Subagent Strategy

- Use subagents liberally to keep main context window clean.
- Offload research, exploration, and parallel analysis to subagents.
- For complex problems, throw more compute at it via subagents.
- One task per subagent for focused execution.

### 3. Self-Improvement Loop

- After ANY correction from the user: update `docs/lessons.md` with the pattern.
- Write rules for yourself that prevent the same mistake.
- Ruthlessly iterate on these lessons until mistake rate drops.
- Review `docs/lessons.md` at session start.

### 4. Verification Before Done

- Never mark a task complete without proving it works.
- Diff behavior between main and your changes when relevant.
- Ask: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness.
- For UI/canvas/PDF changes: dogfood through headed Chromium against `localhost:5173`. Unit tests alone are insufficient for visual/layout/PDF bugs.
- Golden suites (see AGENTS.md):
  - `npm run golden` — **CI GATE**. Must be green before committing export/tool/UI changes. Regressions become P1 beads.
  - `npm run golden:milestones` — **SCOREBOARD**. Never blocks merges; red entries are backlog inputs.
  - `npm run dogfood` — headed-Chromium gates against the live build.

### 5. Demand Elegance (Balanced)

- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution."
- Skip this for simple, obvious fixes — don't over-engineer.
- Challenge your own work before presenting it.

### 6. Autonomous Bug Fixing

- When given a bug report: just fix it. Don't ask for hand-holding.
- Point at logs, errors, failing tests — then resolve them.
- Zero context switching required from the user.
- Go fix failing CI tests without being told how.

## Task Management

- **Plan First**: create a beads issue (`bd create`) with clear scope before coding.
- **Claim**: `bd update <id> --claim` when starting.
- **Track Progress**: `bd update <id> -s in_progress`, `bd close <id>` when done.
- **Document Results**: append a worklog entry to `docs/worklog/YYYY-MM-DD-<slug>.md` after non-trivial sessions; update the index in `docs/worklog/README.md` and the table in AGENTS.md.
- **Capture Lessons**: update `docs/lessons.md` after corrections.

## Essential Reading

- **[AGENTS.md](AGENTS.md)** — current state, open priorities, golden-suite policy, worklog index. Re-read at session start.
- **[docs/API.md](docs/API.md)** — model + tool registry reference. Read before touching `src/model/` or `src/tools/`.
- **[docs/lessons.md](docs/lessons.md)** — corrections from prior sessions. Update after any correction.

## Core Principles

- **Simplicity First**: make every change as simple as possible. Impact minimal code.
- **No Laziness**: find root causes. No temporary fixes. Senior-developer standards.
- **Minimal Impact**: changes should only touch what's necessary. Avoid introducing bugs.

## Beads (Issue Tracking)

```bash
bd ready                       # What can I work on?
bd show <id>                   # Issue details
bd update <id> --claim         # Claim work atomically
bd close <id> --reason="..."   # When complete
bd close <id1> <id2> ...       # Close multiple at once
bd sync                        # Sync with git remote
bd create --title="..." --description="..." --type=task|bug|feature --priority=2
bd dep add <issue> <depends-on>  # Add dependency
bd blocked                     # Show blocked issues
bd stats                       # Project statistics
```

Issues have dependencies. Respect the DAG.
