# Phase 3: Session Execution & Weekly Cycle

## Overview

**Goal:** Execute sprint missions through single-session workflow, with automated handoffs between missions and a systematic weekly cycle.

Phase 3 is where your planning becomes working software. You'll execute missions one session at a time, with the AI automatically updating documentation for seamless transitions. At the end of each sprint, you'll review progress and loop back to update your roadmap for the next sprint.

---

## Prerequisites

Before starting Phase 3, you must have:

- [ ] Completed Phase 2 (current sprint missions planned and documented)
- [ ] `/missions/sprint-XX/` folder structure exists
- [ ] All mission files created (R#.# and/or B#.#)
- [ ] First mission is ready to execute

---

## Phase 3 Overview

Phase 3 consists of three interconnected processes:

1. **Initial Sprint Setup** - Set up tracking files for the sprint (one-time per sprint)
2. **Session Execution** - Execute individual missions with automated handoffs (repeats per mission)
3. **Weekly Cycle** - Complete sprint, review roadmap, plan next sprint (repeats per sprint)

```
┌───────────────────────────────────────────────────────┐
│  Phase 1: Foundation (roadmap + architecture)       │
└──────────────────┬────────────────────────────────────┘
                   │
                   ▼
┌───────────────────────────────────────────────────────┐
│  Phase 2: Mission Planning (sprint missions)        │
└──────────────────┬────────────────────────────────────┘
                   │
                   ▼
┌───────────────────────────────────────────────────────┐
│  Phase 3: Session Execution                         │
│  ┌───────────────────────────────────────────────┐  │
│  │  1. Initial Sprint Setup (one-time)           │  │
│  └───────────────────────────────────────────────┘  │
│                    │                                 │
│                    ▼                                 │
│  ┌───────────────────────────────────────────────┐  │
│  │  2. Session Execution Loop                    │  │
│  │     - Execute mission                         │  │
│  │     - AI updates files for next mission       │  │
│  │     - Human verifies and continues            │  │
│  │     (Repeats for each mission in sprint)      │  │
│  └───────────────────────────────────────────────┘  │
│                    │                                 │
│                    ▼                                 │
│  ┌───────────────────────────────────────────────┐  │
│  │  3. Weekly Cycle                              │  │
│  │     - Sprint complete                         │  │
│  │     - Review roadmap (Phase 1)                │  │
│  │     - Plan next sprint (Phase 2)              │  │
│  │     - Loop back to Session Execution          │  │
│  └───────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────┘
```

---

## Part 1: Initial Sprint Setup

This is done **once per sprint** before executing any missions.

### Step 1: Create Sprint Tracking Files

You'll maintain canonical sprint files and update tracking files that enable automated handoffs:

1. **`/missions/sprint-XX/build_sprint.XX.yaml`** - Canonical list of build missions per sprint
2. **`/missions/sprint-XX/research_sprint.XX.yaml`** (optional) - Canonical list of research missions per sprint
3. **`/missions/backlog.yaml`** - Master backlog across all sprints
4. **`/missions/current.yaml`** - Current mission details and handoff instructions
5. **`/PROJECT_CONTEXT.json`** - Machine-readable project state
 

**Action Items:**
- [ ] Create `/missions/backlog.yaml` if it doesn't exist
- [ ] Create `/missions/current.yaml` if it doesn't exist
- [ ] Create `/PROJECT_CONTEXT.json` if it doesn't exist
 
Handoff consolidation: The AI handoff lives in `missions/current.yaml` (completionProtocol and context) and `PROJECT_CONTEXT.json` (state/continuity). No separate handoff files are used.


### Step 2: Initialize Backlog

The backlog captures all missions for the current sprint at a glance.

Initialize backlog content from the canonical sprint file (`build_sprint.XX.yaml`).

**Create `/missions/backlog.yaml`:**

```yaml
# backlog.yaml - Sprint Plan Metadata
name: "Planning.SprintPlan.v1"
version: "1.0.0"
displayName: "Sprint Plan Orchestrator"
description: "Master backlog tracking all sprints, missions, and dependencies"
author: "Your Name/Team"


---

# Mission File: project-main-backlog.yaml

missionId: "SP-MAIN-001"

objective: "To successfully track, manage, and complete all planned development sprints from foundation through final delivery."

context: |
  This mission file represents the master backlog and sprint plan for the [Your Project Name] project.
  It provides a single source of truth for what has been completed, what is in progress, and what is planned.
  This structured format allows for automated status tracking and dependency management.

successCriteria:
  - "All missions within the current sprint are moved through 'Current' to 'Completed' status."
  - "Sprint transitions are properly documented with learnings captured."

deliverables:
  - "A fully updated version of this mission file with accurate sprint and mission status."

domainFields:
  type: "Planning.SprintPlan.v1"

  sprints:
    # Completed Sprints (example structure)
    - sprintId: "Sprint 1"
      title: "Foundation - [Your Sprint Theme]"
      focus: "[Brief description from roadmap]"
      status: "Completed"
      missions:
        - { id: "B1.1", name: "[Component Name]", status: "Completed" }
        - { id: "B1.2", name: "[Component Name]", status: "Completed" }
        - { id: "B1.3", name: "[Component Name]", status: "Completed" }

    # Current Sprint
    - sprintId: "Sprint N"
      title: "[Sprint Theme]"
      focus: "[Brief description from roadmap]"
      status: "In Progress"
      missions:
        - { id: "BN.1", name: "[Component Name]", status: "Current" }
        - { id: "BN.2", name: "[Component Name]", status: "Queued" }
        - { id: "BN.3", name: "[Component Name]", status: "Queued" }

    # Future Sprints
    - sprintId: "Sprint N+1"
      title: "[Next Sprint Theme]"
      focus: "[Brief description from roadmap]"
      status: "Planned"
      missions:
        - { id: "BN+1.1", name: "[Component Name]", status: "Planned" }
        - { id: "BN+1.2", name: "[Component Name]", status: "Planned" }

  # Mission Dependencies
  missionDependencies:
    - { from: "BN.1", to: "BN.2", type: "Blocks" }
    - { from: "BN.1", to: "BN.3", type: "Blocks" }
    - { from: "BN.2", to: "BN.4", type: "Blocks" }
    - { from: "BN.3", to: "BN.4", type: "Blocks" }

  # Sprint Success Metrics
  successMetrics:
    - "[Key metric from roadmap]"
    - "[Key metric from roadmap]"
    - "[Key metric from roadmap]"
```

**Key Points:**
- List ALL current sprint missions
- Mark completed missions with status "Completed"
- Mark first build mission as status "Current"
- Keep other missions as status "Queued"
- Include success metrics from roadmap

**Action Items:**
- [ ] Copy template above to `/missions/backlog.yaml`
- [ ] Fill in current sprint mission details from Phase 2
- [ ] Add mission dependency relationships
- [ ] List success metrics from roadmap.md

### Step 3: Initialize Current Mission

The `current.yaml` file is the AI's primary instruction set for each session. It contains the mission details and **critical handoff instructions**.

**Create `/missions/current.yaml` from the canonical sprint file:**

Select the first mission from `/missions/sprint-XX/build_sprint.XX.yaml` (or from `/missions/sprint-XX/research_sprint.XX.yaml` if starting with research) and add the completion protocol.

**Template structure:**

```yaml
# Mission File: BN.1_[component-name].yaml

missionId: "BN.1-YYYYMMDD-001"

objective: "[Clear statement of what this mission accomplishes]"

context: |
  This is mission BN.1 of Sprint N, focusing on [category/domain].
  [Additional context about the mission's role in the sprint]

successCriteria:
  - "[Functional requirement 1]"
  - "[Functional requirement 2]"
  - "[Performance requirement]"
  - "[Test coverage requirement]"
  - "The completionProtocol checklist is fully executed."

deliverables:
  - "File: path/to/file1.ts"
  - "File: path/to/file2.ts"
  - "Tests: path/to/test.spec.ts"
  - "Docs: Updated relevant documentation"

domainFields:
  type: "Build.Implementation.v1"

  researchFoundation:
    - finding: "[Key finding from research]"
      sourceMission: "RN.1_[topic]"
    - finding: "[Performance target from research]"
      sourceMission: "RN.1_[topic]"

  implementationScope:
    coreDeliverable: "[Description of what will be built]"
    outOfScope:
      - "[What is explicitly not included]"
      - "[Deferred features]"

  validationProtocol:
    - validator: "Unit Tests"
      focus: "[What aspects to test]"
    - validator: "Integration Tests"
      focus: "[End-to-end scenarios]"

  handoffContext:
    completed: []
    interfaces:
      - "[Interface/API specifications]"
    assumptions:
      - "[Technical assumptions]"
    nextMission: "BN.2_[next-component]: [Brief description]"
    blockers: []

  completionProtocol:
    description: "When this mission is complete, update the following files"
    required:
      - file: "missions/backlog.yaml"
        action: "Update current mission status to 'Completed', set next mission to 'Current'"
        
      - file: "missions/current.yaml"
        action: "Replace entire file with next mission (BN.2) content"
        
      - file: "PROJECT_CONTEXT.json"
        action: |
          Update:
          - working_memory.session_count (increment)
          - domains.[domain].missions.BN.1.status = "complete"
          - domains.[domain].missions.BN.2.status = "in_progress"
          - mission_planning.current_mission (update to BN.2)
          - current_sprint.active_mission (update to BN.2)
          - current_sprint.completed_missions (add BN.1)
      
    optional:
      - file: "SESSIONS.jsonl"
        action: "Append session log entry with mission completion data"

    verification:
      - "All deliverable files created and tests passing"
      - "All required files updated"
      - "Next mission (BN.2) is ready to execute"
      - "No placeholder text remains in updated files"
```

**Action Items:**
- [ ] Create `/missions/current.yaml` using template above
- [ ] Fill in mission details from first mission file
- [ ] Ensure completionProtocol section is included
- [ ] Verify all paths and references are correct

### Step 4: Initialize PROJECT_CONTEXT.json

This machine-readable file enables AI to track project state across sessions.

**Create `/PROJECT_CONTEXT.json`:**

```json
{
  "project_name": "[Your Project Name]",
  "version": "1.0.0",
  "created": "YYYY-MM-DD",
  "last_updated": "YYYY-MM-DD",
  
  "working_memory": {
    "active_domain": "[domain for first mission]",
    "session_count": 1,
    "last_session": "YYYY-MM-DD-sprint-N-start"
  },
  
  "domains": {
    "[domain_name]": {
      "status": "active",
      "priority": 1,
      "current_mission": "BN.1",
      "missions": {
        "BN.1": {
          "name": "[Mission Name]",
          "status": "in_progress",
          "started": "YYYY-MM-DD",
          "target_completion": "[estimated sessions]"
        },
        "BN.2": {
          "name": "[Mission Name]",
          "status": "queued"
        }
      },
      "critical_facts": [
        "[Key technical decision]",
        "[Performance target]",
        "[Constraint]"
      ],
      "constraints": [
        "[Technical constraint]",
        "[Resource constraint]"
      ],
      "decisions_made": [],
      "files_to_create": [
        "path/to/file1.ts",
        "path/to/file2.ts"
      ],
      "research_completed": [
        "missions/research/RN.1_[topic].md"
      ],
      "achievements": []
    }
  },
  
  "mission_planning": {
    "current_mission": {
      "id": "BN.1",
      "name": "[Mission Name]",
      "sprint": "N",
      "status": "ready",
      "context_files": [
        "PROJECT_CONTEXT.json",
        "missions/current.yaml"
      ],
      "research": [
        "missions/research/RN.1_[topic].md"
      ],
      "deliverables": [
        "[Key deliverable 1]",
        "[Key deliverable 2]"
      ]
    },
    "next_mission": {
      "id": "BN.2",
      "name": "[Next Mission]",
      "status": "queued"
    },
    "current_sprint_missions": {
      "BN.1": {
        "name": "[Mission Name]",
        "status": "in_progress",
        "priority": 1
      },
      "BN.2": {
        "name": "[Mission Name]",
        "status": "queued",
        "priority": 2
      }
    }
  },
  
  "current_sprint": {
    "sprint": "N",
    "phase": "Sprint N: [Theme]",
    "active_mission": "BN.1: [Mission Name]",
    "completed_missions": [],
    "queued_missions": [
      "BN.2: [Name]",
      "BN.3: [Name]"
    ],
    "blockers": [],
    "next_milestone": "Sprint N+1: [Next Theme]"
  },
  
  "ai_instructions": {
    "context_priority": [
      "missions/current.yaml",
      "PROJECT_CONTEXT.json"
    ],
    "special_instructions": [
      "Follow completionProtocol in current.yaml exactly",
      "Update all required files before marking mission complete"
    ]
  }
}
```

**Action Items:**
- [ ] Create `/PROJECT_CONTEXT.json` using template above
- [ ] Fill in project name and dates
- [ ] Add domain information from technical_architecture.md
- [ ] List all current sprint missions
- [ ] Verify JSON is valid (use a JSON validator)

### Step 5: Initialize Handoff Context

Consolidate handoff into `missions/current.yaml` (handoffContext) and `PROJECT_CONTEXT.json` (continuity/state). Ensure current mission details, recent decisions, and next mission are reflected there.

### Step 6: Verify Initial Setup

Before executing your first session, verify all files are correct.

**Verification Checklist:**

- [ ] `/missions/backlog.yaml` exists and shows BN.1 as status "Current"
- [ ] `/missions/current.yaml` exists with BN.1 details and completionProtocol
- [ ] `/PROJECT_CONTEXT.json` exists and is valid JSON
 
- [ ] All file paths reference canonical sprint files (`/missions/sprint-XX/*_sprint.XX.yaml`) and research files in `/missions/research/`
- [ ] completionProtocol is at end of `current.yaml`
- [ ] No placeholder text like [FILL IN] or TODO

**Validation Commands:**

```bash
# Verify file existence
ls missions/backlog.yaml missions/current.yaml PROJECT_CONTEXT.json

# Validate JSON
node -e "JSON.parse(require('fs').readFileSync('PROJECT_CONTEXT.json'))"
# Should show no errors

# Validate YAML
npx js-yaml missions/backlog.yaml
npx js-yaml missions/current.yaml
# Should show no errors

# Check for placeholders
grep -r "\[FILL\|TODO\|XXX" missions/backlog.yaml missions/current.yaml
# Should return nothing
```

---

## Part 2: Session Execution

This process repeats for **each mission** in the sprint.

### Failure & Rollback

If a session fails or a handoff is incomplete, do not advance `missions/current.yaml`. Follow the deterministic procedure in [operations.failure-rollback.md](operations.failure-rollback.md).

### The Session Execution Loop

Each mission follows this pattern:

```
1. Human loads context (current.yaml + PROJECT_CONTEXT.json)
2. Human starts AI session with mission from current.yaml
3. AI executes mission and creates deliverables
4. AI updates all required files per completionProtocol
5. Human verifies updates and deliverables
6. Loop: Next mission is ready in current.yaml
```

### Step 1: Prepare for Session

**Action Items:**
- [ ] Read `/missions/current.yaml` to understand mission
- [ ] Check `/PROJECT_CONTEXT.json` for state
- [ ] Verify dependencies from previous missions are complete

### Step 2: Start AI Session

**Provide AI with context:**

```
I need you to execute the mission in missions/current.yaml.

Please read these files for context:
- missions/current.yaml (mission details and completionProtocol)
- PROJECT_CONTEXT.json (project state)

Follow the completionProtocol in current.yaml EXACTLY when done.
```

**If using research:**
```
Also review the research foundation:
- missions/research/RN.1_[topic].md
```

### Step 3: AI Executes Mission

The AI will:
1. Read all context files
2. Implement the mission deliverables
3. Run tests/validation
4. Update required files per completionProtocol:
   - `missions/backlog.yaml` - Mark complete, set next as current
   - `missions/current.yaml` - Replace with next mission details
   - `PROJECT_CONTEXT.json` - Update session count, mission status

### Step 4: Verify Mission Completion

**Human verification checklist:**

**Code Deliverables:**
- [ ] All files in deliverables list created
- [ ] Tests pass successfully
- [ ] Performance targets met (if applicable)
- [ ] Code follows project patterns

**Documentation Updates:**
- [ ] `missions/backlog.yaml` - Current mission status "Completed", next marked "Current"
- [ ] `missions/current.yaml` - Replaced entirely with next mission
- [ ] `PROJECT_CONTEXT.json` - Session count incremented, missions updated

**Verification Commands:**

```bash
# Run tests
npm test  # or equivalent for your project

# Validate files
node -e "JSON.parse(require('fs').readFileSync('PROJECT_CONTEXT.json'))"
npx js-yaml missions/backlog.yaml
npx js-yaml missions/current.yaml

# Check file updates
git diff missions/backlog.yaml missions/current.yaml PROJECT_CONTEXT.json

# Verify next mission is ready
grep "status: Current" missions/backlog.yaml
head -30 missions/current.yaml
```

### Step 5: Continue or Pause

**If continuing to next mission immediately:**
- [ ] current.yaml now contains next mission (BN.2)
- [ ] Return to Step 1 with new mission

**If pausing:**
- [ ] Commit changes if using version control
- [ ] missions/current.yaml contains next mission ready to resume
- [ ] When resuming, start at Step 1

### Session Execution Example

**Before Session (missions/current.yaml shows BN.1):**
```yaml
missionId: "BN.1-YYYYMMDD-001"
objective: "Build core parser component"
# ... mission details ...
completionProtocol:
  description: "When complete, update all tracking files"
  # ... protocol details ...
```

**After Session (missions/current.yaml now shows BN.2):**
```yaml
missionId: "BN.2-YYYYMMDD-001"
objective: "Extend parser with advanced features"
# ... next mission details ...
completionProtocol:
  description: "When complete, update all tracking files"
  # ... protocol details ...
```

**Updated backlog.yaml:**
```yaml
missions:
  - { id: "BN.1", name: "Core Parser", status: "Completed" }
  - { id: "BN.2", name: "Parser Extensions", status: "Current" }
  - { id: "BN.3", name: "Integration Layer", status: "Queued" }
```

**The loop continues:** Next session starts with BN.2 already loaded in current.yaml.

---

## Part 3: Weekly Cycle (Sprint Completion)

At the end of the current sprint (when all missions are complete), you'll review progress and loop back to Phase 1.

### Sprint Completion Criteria

Sprint is complete when:

- [ ] All missions in `/missions/backlog.yaml` marked status "Completed"
- [ ] All success metrics from backlog achieved
- [ ] All tests passing
- [ ] Sprint deliverables functional
- [ ] Sprint summary present in current.yaml/PROJECT_CONTEXT.json handoff fields

### Step 1: Generate Sprint Summary

The handoff fields in current.yaml and PROJECT_CONTEXT.json naturally become your sprint summary.

**Ensure handoff fields include:**

```markdown
## Sprint N Complete! ✅

### All Sprint Missions Delivered
- ✅ **BN.1**: [Mission Name]
  - [Key achievement]
- ✅ **BN.2**: [Mission Name]
  - [Key achievement]
- ✅ **BN.3**: [Mission Name]
  - [Key achievement]
[All missions listed]

### Sprint Summary

**Total Deliverables:**
- [X] production files created
- [Y] passing tests
- Test coverage: [percentage or description]
- Performance targets: [met/exceeded]

**Key Achievements:**
1. [Major achievement 1]
2. [Major achievement 2]
3. [Major achievement 3]

**Technical Decisions Made:**
1. [Decision 1 with rationale]
2. [Decision 2 with rationale]

**Blockers Encountered:**
- [Blocker 1 and resolution]
- [Blocker 2 and resolution]

**Learnings for Next Sprint:**
- [Learning 1]
- [Learning 2]
```

**Action Items:**
- [ ] Review handoff fields for completeness (current.yaml/PROJECT_CONTEXT.json)
- [ ] Add any final sprint notes
- [ ] Ensure all achievements documented
- [ ] Document any blockers or learnings

### Step 2: Review Roadmap (Back to Phase 1)

Use your sprint summary to review and update your roadmap.

**Review Questions:**

1. **Did this sprint achieve its goals?**
   - Compare deliverables to roadmap.md sprint section
   - Were success metrics met?
   - Any significant deviations?

2. **Does the roadmap still make sense?**
   - Based on learnings, should next sprint change?
   - New blockers or risks discovered?
   - Timeline adjustments needed?

3. **Is additional research needed?**
   - Did this sprint reveal unknowns?
   - Technical decisions that need validation for next sprint?

**Action Items:**
- [ ] Open `/docs/roadmap.md`
- [ ] Mark current sprint as complete
- [ ] Update sprint section with actual results
- [ ] Review next sprint plan - does it still make sense?
- [ ] Adjust next sprint scope/approach if needed
- [ ] Update success metrics based on learnings
- [ ] Document any roadmap changes with rationale

**Example Roadmap Update:**

```markdown
## Sprint N: [Theme] ✅ COMPLETE
**Planned:** [Original plan from roadmap]
**Actual:** [What was actually delivered]

### Completed Missions
- [x] BN.1: [Mission Name]
- [x] BN.2: [Mission Name]
- [x] BN.3: [Mission Name]
- [x] BN.4: [Mission Name]

### Results
- ✅ All planned features delivered
- ✅ Performance targets exceeded
- ⚠️ Discovered need for [adjustment]
- ✅ Test coverage: [percentage]

### Learnings
- [Key learning 1]
- [Key learning 2]
- [Adjustment made]

## Sprint N+1: [Next Theme] (NEXT)
**Adjusted Plan:** [Updated plan based on learnings]

[Updated next sprint plan]
```

### Step 3: Decide on Next Sprint

**Three possible paths:**

**Path A: Continue to Next Sprint as Planned**
- Roadmap next sprint is still valid
- No major blockers discovered
- Proceed to Phase 2 with next sprint

**Path B: Inject Research Sprint**
- Current sprint revealed unknowns
- Technical decisions need validation
- Create research sprint before next build sprint

**Path C: Adjust Next Sprint Scope**
- Current sprint took longer/shorter than expected
- New priorities emerged
- Update roadmap, then proceed to Phase 2

**Decision Framework:**

```
┌─ Sprint Complete ─┐
│                   │
│ Review Roadmap    │
│                   │
└──────┬────────────┘
       │
       ▼
   ┌───────────────────────────┐
   │ Next sprint still valid?  │
   └──┬────────────────────┬───┘
      │                    │
     YES                  NO
      │                    │
      ▼                    ▼
   ┌────────────┐     ┌──────────────┐
   │ Proceed to │     │ Update       │
   │ Phase 2 →  │     │ roadmap.md   │
   │ Next Sprint│     │ and/or       │
   │            │     │ architecture │
   └────────────┘     └──────┬───────┘
                             │
                             ▼
                      ┌─────────────────┐
                      │ Research needed?│
                      └────┬───────┬────┘
                           │       │
                          YES     NO
                           │       │
                           ▼       ▼
                      ┌────────────────┐
                      │ Proceed to     │
                      │ Phase 2 with   │
                      │ adjusted plan  │
                      └────────────────┘
```

**Action Items:**
- [ ] Decide which path: Continue, Research, or Adjust
- [ ] Update roadmap.md if needed
- [ ] Update technical_architecture.md if needed
- [ ] Document decision rationale

### Step 4: Plan Next Sprint (Back to Phase 2)

Once roadmap is confirmed/updated, return to Phase 2 to plan next sprint missions.

**Action Items:**
- [ ] Create `/missions/sprint-XX/` folder structure (increment sprint number)
- [ ] Create research missions if needed (RX.#)
- [ ] Create build missions (BX.#)
- [ ] Follow Phase 2 process for next sprint

### Step 5: Begin Next Sprint Execution

With next sprint missions planned, return to Part 1 of Phase 3 (Initial Sprint Setup).

**Action Items:**
- [ ] Update `/missions/backlog.yaml` with next sprint missions
- [ ] Create new `/missions/current.yaml` for first mission of next sprint
- [ ] Update `/PROJECT_CONTEXT.json` for next sprint
- [ ] Update handoff fields with next sprint context
- [ ] Execute next sprint missions following Part 2 process

---

## The Complete Cycle

```
Phase 1: Foundation
    ↓
Phase 2: Mission Planning (Sprint N)
    ↓
Phase 3: Initial Sprint Setup (Part 1)
    ↓
Phase 3: Execute Missions (Part 2) ←──┐
    │                                  │
    │ (Repeat for each mission)        │
    └──────────────────────────────────┘
    ↓
Phase 3: Sprint Complete (Part 3)
    ↓
Phase 1: Review Roadmap (update if needed)
    ↓
Phase 2: Mission Planning (Sprint N+1)
    ↓
Phase 3: Initial Sprint Setup (Sprint N+1)
    ↓
Phase 3: Execute Missions (Sprint N+1) ←──┐
    │                                      │
    │ (Repeat for each mission)            │
    └──────────────────────────────────────┘
    ↓
[Continue until project complete]
```

---

## Tips for Effective Session Execution

### Automate the Handoff

The completionProtocol in `current.yaml` is designed to automate transitions. Trust the AI to update files correctly, but always verify.

### Keep Sessions Focused

- Execute one mission per session
- Don't combine missions unless they're very small (<10k tokens)
- Let the completionProtocol handle the handoff

### Verify Before Continuing

Always verify the 4 file updates before starting the next session. A small error compounds across sessions.

### Use Version Control

Commit after each mission completion. This creates rollback points and clear history.

```bash
git add .
git commit -m "Complete BN.X: [Mission Name]"
```

### Track Sessions (Optional)

The SESSIONS.jsonl file is optional but useful for metrics:

```bash
# View session history
cat SESSIONS.jsonl | jq .

# Count completed missions
cat SESSIONS.jsonl | jq -r .mission | sort | uniq | wc -l

# Calculate average tokens per mission
cat SESSIONS.jsonl | jq '.tokens_in + .tokens_out' | awk '{sum+=$1} END {print sum/NR}'
```

### Handle Blockers

If a mission reveals a blocker:

1. **Document it** in current mission notes
2. **Don't skip** - resolve or adjust
3. **Update roadmap** if it affects future sprints
4. **Create research mission** if technical validation needed
5. **Adjust mission scope** if needed (split into smaller missions)

### Maintain Momentum

The system is designed for daily execution:
- Morning: Execute 1-2 missions
- Afternoon: Execute 1-2 more missions
- End of day: Review progress

Adjust cadence to your capacity, but consistency matters more than speed.

---

## Common Pitfalls

### Pitfall 1: Skipping Completion Protocol

**Problem:** AI completes mission but doesn't update files.  
**Impact:** Next session has no context, requires manual setup.  
**Solution:** Ensure completionProtocol is in current.yaml, verify updates.

### Pitfall 2: Not Verifying File Updates

**Problem:** Trust AI updates without checking.  
**Impact:** Errors compound across sessions.  
**Solution:** Always run verification commands before continuing.

### Pitfall 3: Combining Too Many Missions

**Problem:** Try to execute multiple missions in one session to save time.  
**Impact:** Exceeds token budget, incomplete work, unclear handoffs.  
**Solution:** One mission per session. Trust the process.

### Pitfall 4: Ignoring Sprint Summary

**Problem:** Complete sprint, immediately start next without review.  
**Impact:** Miss learnings, repeat mistakes, roadmap becomes stale.  
**Solution:** Always review roadmap between sprints, update based on learnings.

### Pitfall 5: Not Updating Roadmap

**Problem:** Roadmap diverges from reality over time.  
**Impact:** Loss of strategic direction, poor planning.  
**Solution:** Treat roadmap as living document, update after each sprint.

---

## Phase 3 Complete

You've successfully completed Phase 3 when:

- [ ] All missions in current sprint executed
- [ ] Sprint summary documented in current.yaml/PROJECT_CONTEXT.json
- [ ] Roadmap reviewed and updated
- [ ] Next sprint planned (Phase 2)
- [ ] Ready to execute next sprint (loop back to Part 1)

**The CMOS cycle continues:** Each sprint builds on the previous, with systematic review and adjustment at each transition.

---

## Quick Reference

### Files That Enable Automation

1. **missions/backlog.yaml** - Sprint-level tracking
2. **missions/current.yaml** - Session instructions + completionProtocol
3. **PROJECT_CONTEXT.json** - Machine-readable state
 

### Key Automation Trigger

The **completionProtocol** section at the end of `current.yaml` tells the AI exactly how to update all files for seamless handoff.

### Session Execution Commands

```bash
# Before session
ls missions/current.yaml PROJECT_CONTEXT.json

# After session - verify
npm test
node -e "JSON.parse(require('fs').readFileSync('PROJECT_CONTEXT.json'))"
npx js-yaml missions/backlog.yaml
npx js-yaml missions/current.yaml
git diff

# Commit
git add .
git commit -m "Complete [mission-id]: [mission-name]"
```

### Sprint Transition Checklist

- [ ] All missions complete
- [ ] Sprint summary present in handoff fields
- [ ] Review roadmap.md
- [ ] Update roadmap if needed
- [ ] Plan next sprint (Phase 2)
- [ ] Set up next sprint files (Phase 3 Part 1)

---

*Phase 3 enables rapid, systematic execution with minimal friction and maximum continuity.*
