# Agent Instructions

This project uses **bd** (beads) for issue tracking. Run `bd onboard` to get started.

## Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work atomically
bd close <id>         # Complete work
bd sync               # Sync with git
```

## Non-Interactive Shell Commands

**ALWAYS use non-interactive flags** with file operations to avoid hanging on confirmation prompts.

Shell commands like `cp`, `mv`, and `rm` may be aliased to include `-i` (interactive) mode on some systems, causing the agent to hang indefinitely waiting for y/n input.

**Use these forms instead:**
```bash
# Force overwrite without prompting
cp -f source dest           # NOT: cp source dest
mv -f source dest           # NOT: mv source dest
rm -f file                  # NOT: rm file

# For recursive operations
rm -rf directory            # NOT: rm -r directory
cp -rf source dest          # NOT: cp -r source dest
```

**Other commands that may prompt:**
- `scp` - use `-o BatchMode=yes` for non-interactive
- `ssh` - use `-o BatchMode=yes` to fail instead of prompting
- `apt-get` - use `-y` flag
- `brew` - use `HOMEBREW_NO_AUTO_UPDATE=1` env var

<!-- BEGIN BEADS INTEGRATION -->
## Issue Tracking with bd (beads)

**IMPORTANT**: This project uses **bd (beads)** for ALL issue tracking. Do NOT use markdown TODOs, task lists, or other tracking methods.

### Why bd?

- Dependency-aware: Track blockers and relationships between issues
- Git-friendly: Auto-syncs to JSONL for version control
- Agent-optimized: JSON output, ready work detection, discovered-from links
- Prevents duplicate tracking systems and confusion

### Quick Start

**Check for ready work:**

```bash
bd ready --json
```

**Create new issues:**

```bash
bd create "Issue title" --description="Detailed context" -t bug|feature|task -p 0-4 --json
bd create "Issue title" --description="What this issue is about" -p 1 --deps discovered-from:bd-123 --json
```

**Claim and update:**

```bash
bd update <id> --claim --json
bd update bd-42 --priority 1 --json
```

**Complete work:**

```bash
bd close bd-42 --reason "Completed" --json
```

### Issue Types

- `bug` - Something broken
- `feature` - New functionality
- `task` - Work item (tests, docs, refactoring)
- `epic` - Large feature with subtasks
- `chore` - Maintenance (dependencies, tooling)

### Priorities

- `0` - Critical (security, data loss, broken builds)
- `1` - High (major features, important bugs)
- `2` - Medium (default, nice-to-have)
- `3` - Low (polish, optimization)
- `4` - Backlog (future ideas)

### Workflow for AI Agents

1. **Check ready work**: `bd ready` shows unblocked issues
2. **Claim your task atomically**: `bd update <id> --claim`
3. **Work on it**: Implement, test, document
4. **Discover new work?** Create linked issue:
   - `bd create "Found bug" --description="Details about what was found" -p 1 --deps discovered-from:<parent-id>`
5. **Complete**: `bd close <id> --reason "Done"`

### Auto-Sync

bd automatically syncs with git:

- Exports to `.beads/issues.jsonl` after changes (5s debounce)
- Imports from JSONL when newer (e.g., after `git pull`)
- No manual export/import needed!

### Important Rules

- ✅ Use bd for ALL task tracking
- ✅ Always use `--json` flag for programmatic use
- ✅ Link discovered work with `discovered-from` dependencies
- ✅ Check `bd ready` before asking "what should I work on?"
- ❌ Do NOT create markdown TODO lists
- ❌ Do NOT use external issue trackers
- ❌ Do NOT duplicate tracking systems

For more details, see README.md and docs/QUICKSTART.md.

<!-- END BEADS INTEGRATION -->

## Testing with playwright-cli

This project uses **playwright-cli** (installed as a Claude Code skill at `.claude/skills/playwright-cli`) for e2e and visual verification testing. Every feature that affects the canvas, tools, or UI must be verified via playwright-cli in addition to Vitest unit tests.

### Workflow

1. **Ensure the dev server is running**: `npm run dev` (serves at `http://localhost:5173`)
2. **Open the browser**: `playwright-cli open http://localhost:5173`
3. **Inspect the page**: `playwright-cli snapshot` (accessibility tree with refs)
4. **Take screenshots**: `playwright-cli screenshot` (saves PNG)
5. **Interact with elements**: `playwright-cli click <ref>`, `playwright-cli fill <ref> <text>`
6. **Run JS assertions**: `playwright-cli eval "document.querySelector('svg')?.getAttribute('viewBox')"`
7. **Mouse interactions**: `playwright-cli mousemove <x> <y>`, `playwright-cli mousewheel <dx> <dy>`
8. **Close when done**: `playwright-cli close`

### When to use playwright-cli

- After implementing any drawing tool — verify elements appear on canvas
- After implementing any UI component — verify layout and interaction
- After implementing zoom/pan — verify coordinate transforms work visually
- After implementing undo/redo — verify state reverts correctly in the browser
- For any bug that involves visual rendering or user interaction

### Testing strategy

- **Vitest**: Pure logic (coordinate math, command history, document model, tool registry)
- **playwright-cli**: Visual correctness, canvas interactions, tool workflows, end-to-end flows

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds

## Project Handoff Context

**Current state (updated each session):**

- **Sprints completed:** 0 (scaffold), 1 (canvas), 2 (doc model/undo), 3 (drawing tools), 4 (selection/move/delete), partial 5-10
- **Test count:** 66 tests passing (Vitest)
- **Issues closed:** 32 of 62 (52%)
- **Next work:** Remaining Sprint 4 (marquee, multi-select), Sprint 5 (transforms), Sprint 6 (color picker), Sprint 7 (layer reorder, arrange), Sprint 8 (pen/bezier), Sprint 9 (text)
- **Dev server:** `npm run dev` → `http://localhost:5173`
- **Build:** `npm run build` (TypeScript + Vite), `cargo check` in `src-tauri/`
- **Key commands:** `bd ready` (next work), `bd list --all` (full backlog), `npm test` (run tests)
- **playwright-cli:** installed globally, skill at `.claude/skills/playwright-cli`. Use for e2e verification.
- **Architecture:** React app shell with imperatively managed SVG canvas, tool registry pattern, command-based undo. See `vectorfeld-prd.md` for full details.
