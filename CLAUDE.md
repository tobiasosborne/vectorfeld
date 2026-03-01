# CLAUDE.md

## Workflow Orchestration

### 1. Plan Mode Default

- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately -- don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy

- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop

- After ANY correction from the user: update `docs/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review `docs/lessons.md` at session start

### 4. Verification Before Done

- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness
- Use playwright-cli to visually verify canvas/UI changes against `localhost:5173`

### 5. Demand Elegance (Balanced)

- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes -- don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing

- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests -- then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

### 7. Demo After Feature Set Completion

When a logical group of features is complete (e.g., all Sprint 3 drawing tools, or all selection features), **verify with playwright-cli** that:

- Every new tool/feature works in the live browser
- Take a screenshot showing the visual result
- Run `playwright-cli snapshot` to verify the accessibility tree is correct
- Exercise the actual UI (catches bad ergonomics early)

**Why**: Visual verification is the best integration test for a graphics editor. It catches rendering bugs, layout issues, and interaction problems that unit tests miss.

## Task Management

- **Plan First**: Create beads issues (`bd create`) with clear scope before coding
- **Verify Plan**: Check in before starting implementation
- **Track Progress**: `bd update <id> -s in_progress` when starting, `bd close <id>` when done
- **Explain Changes**: High-level summary at each step
- **Document Results**: Update handoff context in `AGENTS.md` with session summary
- **Demo After Completion**: Verify with playwright-cli after feature groups (see rule 7 above)
- **Capture Lessons**: Update `docs/lessons.md` after corrections

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.

## Beads (Issue Tracking)

```bash
bd ready                    # What can I work on?
bd show <id>                # Issue details
bd update <id> -s in_progress  # Start work
bd update <id> --claim      # Claim work atomically
bd close <id>               # When complete
bd close <id1> <id2> ...    # Close multiple at once
bd sync                     # Sync with git remote
bd create "Title" -d "Description" -t task|bug|feature -p 2
bd dep add <issue> <depends-on>  # Add dependency
bd blocked                  # Show blocked issues
bd status                   # Project statistics
```

Issues have dependencies. Respect the DAG.
