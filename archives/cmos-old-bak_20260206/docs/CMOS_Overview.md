# CMOS: Context + Mission Orchestration System

## Overview

**CMOS** is an AI-agent-powered framework for building products through structured, session-based development. Rather than traditional time-based planning (days, weeks, sprints), CMOS organizes work into **missions** and **sprints** that can be executed by AI agents in modular sessions with minimal human friction.

### Core Principles

1. **Session-Based Execution** - Work is organized into AI-executable sessions, not hours or days
2. **Mission-Driven Planning** - Each mission is scoped for single-session completion
3. **Automated Handoffs** - AI agents update documentation to enable seamless transitions
4. **Research-Informed Building** - Technical decisions backed by targeted research
5. **Continuous Iteration** - Systematic review and adjustment after each sprint

### Who Is This For?

CMOS is designed for **Product, Engineering, and Design** stakeholders in the Product Lifecycle Development:
- **Product Managers** - Define vision, validate assumptions, track progress
- **Engineers** - Execute technical missions with clear context and scope
- **Designers** - Integrate design work into mission-based workflow
- **Solo Builders** - Complete end-to-end product development with AI assistance
- **Small Teams** - Coordinate parallel work with clear dependencies

---

## The CMOS Workflow

CMOS consists of three phases that form a continuous cycle:

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  PHASE 1: FOUNDATION                                    │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Create foundational documents:                   │  │
│  │  - roadmap.md (sprints, milestones, metrics)      │  │
│  │  - technical_architecture.md (implementation)     │  │
│  │                                                    │  │
│  │  Prerequisites: Validated research/assumptions    │  │
│  │  Output: Strategic foundation for project         │  │
│  └───────────────────────────────────────────────────┘  │
│                          │                              │
│                          ▼                              │
│  PHASE 2: MISSION PLANNING                              │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Transform foundation into executable missions:   │  │
│  │  - Create /missions/sprint-XX/ structure          │  │
│  │  - Decide: Research needed? (R1.#)                │  │
│  │  - Create build missions (B1.#)                   │  │
│  │  - Map dependencies                               │  │
│  │                                                    │  │
│  │  Output: Detailed mission files ready to execute │  │
│  └───────────────────────────────────────────────────┘  │
│                          │                              │
│                          ▼                              │
│  PHASE 3: SESSION EXECUTION & WEEKLY CYCLE              │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Part 1: Initial Sprint Setup (one-time)         │  │
│  │  - Create backlog.yaml, current.yaml                  │  │
│  │  - Initialize PROJECT_CONTEXT.json │  │
│  │                                                    │  │
│  │  Part 2: Execute Missions (repeats per mission)   │  │
│  │  - Load mission from current.yaml                   │  │
│  │  - AI executes mission                            │  │
│  │  - AI updates 4 files for next mission            │  │
│  │  - Human verifies, continues                      │  │
│  │                                                    │  │
│  │  Part 3: Sprint Complete (weekly cycle)           │  │
│  │  - Review sprint summary                          │  │
│  │  - Update roadmap based on learnings      ────┐   │  │
│  │  - Plan next sprint                           │   │  │
│  └────────────────────────────────────────────────│──┘  │
│                                                    │     │
│                                                    │     │
└────────────────────────────────────────────────────┼─────┘
                                                     │
                                    Loop back to Phase 1/2
```

### The Continuous Cycle

CMOS is designed as a **continuous improvement loop**:

1. **Sprint 1**: Foundation → Missions → Execute → Review
2. **Sprint 2**: Adjust Roadmap → New Missions → Execute → Review
3. **Sprint 3**: Further Refinement → Missions → Execute → Review
4. **Continue** until product complete

Each sprint builds on the previous, with systematic review and adjustment at each transition.

---

## Phase Breakdown

### Phase 1: Foundation
**Goal:** Create the two foundational documents that guide your entire project

**Documents Created:**
- `/docs/roadmap.md` - Sprints, milestones, success metrics
- `/docs/technical_architecture.md` - System design, implementation plan

**Key Activities:**
- Review template examples
- Define sprint structure (not calendar-based)
- Detail Sprint 1 completely
- Outline remaining sprints
- Map architecture to sprints
- Cross-validate alignment

**Time Investment:** 2-4 hours

**Prerequisites:** Validated research and assumptions about your product

**Output:** Strategic foundation ready for mission planning

📖 **Full Documentation:** [Getting_Started.md](Getting_Started.md)

---

### Phase 2: Mission Planning
**Goal:** Transform foundational documents into concrete, executable missions

**Folder Structure Created:**
```
missions/
└── sprint-01/
    ├── research/
    │   ├── R1.1_[topic].md
    │   ├── R1.2_[topic].md
    │   └── SYNTHESIS.md (optional)
    └── build/
        ├── B1.1_[component].yaml
        ├── B1.2_[component].yaml
        └── B1.3_[component].yaml
```

**Key Activities:**
- Create sprint folder structure
- **Decision Point:** Research needed for Sprint 1?
- If yes: Create research missions (R1.#)
- Create build missions (B1.#)
- Map dependencies between missions
- Verify alignment with roadmap and architecture

**Time Investment:** 1-3 hours per sprint

**Prerequisites:** Phase 1 complete (both foundational documents)

**Output:** Detailed mission files ready for execution

📖 **Full Documentation:** [Phase_2_Mission_Planning.yaml](Phase_2_Mission_Planning.yaml)

---

### Phase 3: Session Execution & Weekly Cycle
**Goal:** Execute missions with automated handoffs and systematic sprint reviews

**Part 1: Initial Sprint Setup (One-Time)**

**Files Created:**
- `/missions/backlog.yaml` - Sprint-level mission tracking
- `/missions/current.yaml` - Current mission details + completion requirements
- `/PROJECT_CONTEXT.json` - Machine-readable project state

Sprint Source of Truth:
- `missions/sprint-XX/build_sprint.XX.yaml` (build; required)
- `missions/sprint-XX/research_sprint.XX.yaml` (research; optional)
- Backlog derives from `build_sprint.XX.yaml`.
- Handoff is consolidated into `missions/current.yaml` and `PROJECT_CONTEXT.json` — no separate handoff files are used.

**Key Activities:**
- Initialize tracking files from templates
- Load first mission details
- Verify setup before starting

**Time Investment:** 30-60 minutes per sprint

---

**Part 2: Session Execution (Repeats Per Mission)**

**The Automated Loop:**

```
┌──────────────────────────────────────────────────┐
│  1. Human loads current.md                       │
│     ↓                                            │
│  2. AI executes mission                          │
│     ↓                                            │
│  3. AI creates deliverables                      │
│     ↓                                            │
│  4. AI updates 3 files:                          │
│     - backlog.yaml (mark complete, set next)       │
│     - current.yaml (replace with next mission)     │
│     - PROJECT_CONTEXT.json (update state)        │
│     ↓                                            │
│  5. Human verifies updates                       │
│     ↓                                            │
│  6. Next mission ready in current.md             │
│     └──────────────────────┐                     │
│                            │                     │
│  Loop: Repeat for each mission in sprint        │
└────────────────────────────┴─────────────────────┘
```

**Key Activities:**
- Execute one mission per session
- AI updates `missions/current.yaml` and `PROJECT_CONTEXT.json` (+ `missions/backlog.yaml`)
- Human verifies deliverables and file updates
- Continue to next mission (already loaded in current.md)

**Time Investment:** Variable per mission (based on complexity)
- Research missions: 30-90 minutes
- Build missions: 60-180 minutes

**Daily Rhythm:** Execute 2-6 missions per day depending on complexity and capacity

---

**Part 3: Weekly Cycle (Sprint Completion)**

**The Review Loop:**

```
Sprint Complete
    ↓
Generate Sprint Summary (from missions/current.yaml + PROJECT_CONTEXT.json)
    ↓
Review Roadmap (Phase 1)
    ↓
┌──────────────────────────────────┐
│ Is roadmap still valid?          │
└────┬──────────────────────┬──────┘
     │                      │
    YES                    NO
     │                      │
     ▼                      ▼
Continue to         Update roadmap.md
Sprint 2           and/or architecture.md
     │                      │
     └──────┬───────────────┘
            ▼
    Plan Next Sprint (Phase 2)
            ▼
    Execute Next Sprint (Phase 3)
```

**Key Activities:**
- Review sprint summary from missions/current.yaml + PROJECT_CONTEXT.json
- Compare actual vs. planned (roadmap.md)
- Update roadmap based on learnings
- Decide: Continue, Research, or Adjust
- Plan next sprint missions
- Loop back to execution

**Time Investment:** 30-60 minutes between sprints

**Output:** Updated roadmap + next sprint ready to execute

📖 **Full Documentation:** [Phase_3_Session_Execution.md](Phase_3_Session_Execution.md)

---

## Quick Start Guide

### First Time Setup

**1. Complete Phase 1 (2-4 hours)**
```bash
# Read the guide
cat docs/Getting_Started.md

# Review templates
cat docs/roadmap.md
cat docs/technical_architecture.md

# Create your versions
# - roadmap.md with sprints (not calendar dates)
# - technical_architecture.md with implementation plan

# Verify alignment
# Both documents should tell the same story
```

**2. Plan Sprint 1 - Phase 2 (1-3 hours)**
```bash
# Read the guide
cat docs/Phase_2_Mission_Planning.md

# Create folder structure
mkdir -p missions/sprint-01/research
mkdir -p missions/sprint-01/build

# Decide: Research needed?
# If yes: Create R1.1, R1.2, etc.
# Always: Create B1.1, B1.2, B1.3, etc.

# Verify mission files are complete
ls missions/sprint-01/
```

**3. Set Up Sprint 1 - Phase 3 Part 1 (30-60 minutes)**
```bash
# Read the guide
cat docs/Phase_3_Session_Execution.md

# Create tracking files
# - missions/backlog.yaml
# - missions/current.yaml
# - PROJECT_CONTEXT.json

# Verify setup
ls missions/backlog.yaml missions/current.yaml PROJECT_CONTEXT.json
node -e "JSON.parse(require('fs').readFileSync('PROJECT_CONTEXT.json'))"
```

**4. Execute Missions - Phase 3 Part 2 (Daily)**
```bash
# Each session:
# 1. Read missions/current.yaml
# 2. Start AI session with mission
# 3. AI executes and updates files
# 4. Verify deliverables and updates
# 5. Continue to next mission

# Next mission is automatically loaded in current.md
```

**5. Complete Sprint - Phase 3 Part 3 (30-60 minutes)**
```bash
# After all missions complete:
# 1. Review mission handoff in current.yaml/PROJECT_CONTEXT.json
# 2. Update docs/roadmap.md with learnings
# 3. Plan Sprint 2 (back to Phase 2)
# 4. Set up Sprint 2 (back to Phase 3 Part 1)
# 5. Execute Sprint 2 missions
```

---

## Key Concepts

### Sessions vs. Time

**Traditional Planning:**
- "This will take 3 days"
- "We have 2 weeks for this sprint"
- Time-based estimates often wrong

**CMOS Planning:**
- "This is 5 missions"
- "Sprint 1 has 8 missions"
- Session-based, flexible cadence

**Why This Works:**
- AI sessions are bounded by tokens, not time
- Missions are scoped for single sessions
- Humans control cadence (1 mission/day or 6 missions/day)
- No deadline pressure, just clear scope

### Missions vs. Tasks

**Mission Characteristics:**
- Scoped for single AI session (10k-40k tokens)
- Has clear deliverables and success criteria
- Can reference research for context
- Includes handoff instructions for next mission
- Atomic and completeable

**Example Mission:** "Build OpenAPI parser with cycle detection"
- Clear scope: parsing + one specific feature
- Success criteria: tests pass, performance target met
- Deliverables: parser.js, tests.js, docs

**Not a Mission:** "Build entire API framework"
- Too broad for single session
- Should be split into 5-10 missions

### Sprints vs. Calendar Weeks

**Sprint in CMOS:**
- Group of related missions that deliver meaningful milestone
- Could be 3 missions or 20 missions
- Duration varies based on mission complexity
- Named by theme: "Sprint 1: Foundation", "Sprint 2: Analysis"

**Not Calendar-Based:**
- Sprint 1 might take 3 days or 3 weeks
- Depends on mission count and execution cadence
- Flexible to accommodate research, blockers, pivots

### Automated Handoffs

**The Key Innovation:**

Traditional approach:
```
Developer completes work
Developer updates documentation
Developer tells team what to do next
Next developer reads notes, starts work
```

CMOS approach:
```
AI completes mission
AI updates 3 files per completion requirements
Next mission automatically loaded in current.md
Next AI session starts with full context
```

**Files That Enable This:**
1. `backlog.yaml` - Sprint-level tracking
2. `current.yaml` - Session instructions + completion requirements
3. `PROJECT_CONTEXT.json` - Machine-readable state

The **Mission Completion Requirements** section in current.md tells the AI exactly how to update all files, creating seamless transitions.


---

## Common Questions

### Q: How long does each phase take?

**Phase 1:** 2-4 hours (one-time initial setup)
- Can be revisited/updated after each sprint

**Phase 2:** 1-3 hours per sprint
- Planning missions for upcoming sprint

**Phase 3 Part 1:** 30-60 minutes per sprint
- Setting up tracking files

**Phase 3 Part 2:** Variable per mission
- Research: 30-90 minutes per mission
- Build: 60-180 minutes per mission
- Execute 2-6 missions per day based on capacity

**Phase 3 Part 3:** 30-60 minutes between sprints
- Review and plan next sprint

### Q: Can I work on multiple sprints in parallel?

**Not recommended.** CMOS is designed for sequential sprints because:
- Each sprint informs the next
- Learnings from Sprint 1 affect Sprint 2 planning
- Single focus reduces context switching
- Automated handoffs assume linear progression

**Exception:** If you have multiple independent team members, you can:
- Have different people work on different sprints
- Each person follows the CMOS process for their sprint
- Coordinate integration points manually

### Q: What if I need to pivot mid-sprint?

**Flexible injection points:**

1. **Mid-Sprint Pivot (Minor):**
   - Add new mission to sprint (B1.X+1)
   - Update `missions/backlog.yaml` and queue it
   - Execute when dependencies met

2. **Mid-Sprint Pivot (Major):**
   - Complete current mission
   - Pause sprint, return to Phase 1
   - Update roadmap and architecture
   - Re-plan remaining missions (Phase 2)
   - Continue execution with new plan

3. **Emergency Research:**
   - Create research spike mission
   - Insert into queue with high priority
   - Use findings to inform build missions

### Q: Do I need to use all 4 tracking files?

**Minimum Required:**
- `missions/current.yaml` - Absolute minimum (tells AI what to do)

**Highly Recommended:**
- `missions/backlog.yaml` - Track progress across sprint
- `PROJECT_CONTEXT.json` - Enable state persistence

**Optional:**
- `SESSIONS.jsonl` - Metrics and session history

The more files you use, the more automated the handoffs become. All 3 together create seamless transitions.

### Q: Can I use CMOS for non-code projects?

**Yes!** CMOS works for any project that can be broken into missions:

- **Content Creation:** Research + writing missions
- **Design Systems:** Research + design component missions
- **Documentation:** Research + writing + diagram missions
- **Process Improvement:** Research + implementation + validation missions

The key is structuring work into **session-scoped missions** with clear deliverables.

### Q: What AI tools work with CMOS?

**Designed for:**
- Claude (Sonnet, Opus) - Primary development
- ChatGPT (GPT-4) - Validation and alternatives
- Cursor / GitHub Copilot - Inline assistance
- Any AI coding assistant that can read context files

**Key Requirements:**
- Ability to read multiple context files
- Follow structured instructions
- Update files programmatically
- 10k+ token context window

### Q: How do I know if a mission is scoped correctly?

**Good Mission Scope:**
- ✅ Can be completed in one AI session
- ✅ Has 3-5 clear success criteria
- ✅ Estimated 10k-40k tokens
- ✅ Creates 1-5 related files
- ✅ Has clear dependencies (or none)

**Too Large:**
- ❌ "Build entire authentication system"
- ❌ Would take multiple sessions
- ❌ Creates 10+ unrelated files
- ❌ Has vague success criteria

**Too Small:**
- ❌ "Add one variable"
- ❌ Under 5k tokens
- ❌ Could combine with another mission
- ❌ Trivial scope

**Rule of Thumb:** If you can't explain the mission in 2-3 sentences, it's too big. If it feels trivial, combine it.

---

## Success Metrics

### Process Metrics

**Sprint Level:**
- Sprint completion rate (missions completed vs. planned)
- Sprint timeline (sessions required vs. estimated)
- Success criteria achievement (% of sprint goals met)

**Mission Level:**
- Mission completion rate (first try vs. requiring rework)
- Token efficiency (deliverables per token used)
- Handoff quality (next mission starts smoothly)

**Project Level:**
- Roadmap accuracy (actual vs. planned sprints)
- Pivot frequency (how often roadmap adjusts)
- Velocity trend (missions per sprint over time)

### Product Metrics

**From Roadmap:**
- Feature completion rate
- Performance targets met
- User validation milestones
- Market readiness criteria

**Example from OSS Health Monitor:**
- Week 1: Data collection working ✅
- Week 2: Pattern detection accuracy >90% ✅
- Week 3: Dashboard functional ✅
- Week 4: Production deployment ✅

### Quality Metrics

**Code Quality:**
- Test coverage achieved
- Performance targets met
- Code review findings (if applicable)
- Technical debt introduced

**Process Quality:**
- Documentation completeness
- Handoff smoothness (few blockers)
- Research → Build traceability
- Roadmap → Reality alignment

---

## Best Practices

### 1. Start Small, Iterate

**First Project:**
- Simple product (3-5 sprints max)
- Well-understood technology
- Clear success criteria
- Learn the CMOS process

**Later Projects:**
- More ambitious scope
- New technologies (with research)
- Complex integration
- Optimize your CMOS workflow

### 2. Maintain Living Documents

**Roadmap and Architecture:**
- Update after every sprint
- Document learnings and pivots
- Keep them aligned with reality
- Reference in mission planning

**Tracking Files:**
- Trust the automated handoffs
- Verify updates each session
- Commit after each mission
- Use version control

### 3. Respect the Process

**Don't Skip:**
- ❌ Phase 1 review between sprints
- ❌ Mission completion requirements
- ❌ File update verification
- ❌ Sprint summary documentation

**Do Skip:**
- ✅ Optional tracking (SESSIONS.jsonl)
- ✅ Synthesis docs (if not valuable)
- ✅ Excessive documentation

### 4. Optimize for Clarity

**In Planning:**
- Clear mission names (descriptive, not clever)
- Explicit dependencies (B1.2 needs B1.1)
- Measurable success criteria
- Reference research clearly

**In Execution:**
- One mission per session
- Complete handoff updates
- Verify before continuing
- Commit frequently

### 5. Use Research Strategically

**Research When:**
- Technology is unfamiliar
- Performance needs validation
- Multiple approaches possible
- Architectural decision needed

**Skip Research When:**
- Technology is well-known
- Patterns are established
- Implementation is straightforward
- Previous research covers it

### 6. Embrace Iteration

**Expected Pattern:**
- Sprint 1: Foundation (mostly goes as planned)
- Sprint 2: First pivot (learnings from Sprint 1)
- Sprint 3: Refinement (pattern emerging)
- Sprint 4+: Velocity increase (process smooth)

**Don't Expect:**
- Perfect roadmap from day one
- Zero pivots or adjustments
- Constant velocity (it improves)
- No surprises

---

## Troubleshooting

### Issue: AI Doesn't Update Files

**Symptom:** Mission completes but tracking files not updated

**Causes:**
- Completion requirements not in current.md
- AI didn't read full current.md
- AI ran out of tokens

**Solutions:**
- Ensure completion requirements section exists
- Explicitly ask AI to follow completion requirements
- Increase token budget for complex missions
- Verify current.md template is complete

### Issue: Missions Taking Too Long

**Symptom:** Single mission requires multiple sessions

**Causes:**
- Mission scope too large
- Underestimated complexity
- Missing dependencies
- Insufficient research

**Solutions:**
- Split mission into smaller missions
- Add research mission first
- Check dependencies are complete
- Adjust token budget estimate

### Issue: Losing Context Between Sessions

**Symptom:** Each session feels like starting over

**Causes:**
- Tracking files not updated
- Missing context in current.md
- PROJECT_CONTEXT.json stale
 

**Solutions:**
- Verify all required files being updated
- Include mission completion requirements
- Check file update verification steps
- Review Phase 3 automated handoff process

### Issue: Roadmap Diverging from Reality

**Symptom:** Actual progress doesn't match roadmap

**Causes:**
- Skipping sprint reviews (Phase 3 Part 3)
- Not updating roadmap after sprints
- Unrealistic initial estimates
- Scope creep in missions

**Solutions:**
- Always review roadmap between sprints
- Update based on actual sprint results
- Treat roadmap as living document
- Keep mission scope tight

### Issue: Too Many Pivots

**Symptom:** Constantly changing direction

**Causes:**
- Insufficient initial research (Phase 1 prereq)
- Poor mission planning
- Unclear success criteria
- Reacting to every new idea

**Solutions:**
- Invest more in Phase 1 research/validation
- Define clear sprint goals
- Finish current sprint before pivoting
- Use sprint reviews for strategic pivots only

---

## Getting Help

### Documentation Map

1. **Start Here:** [Getting_Started.md](Getting_Started.md)
   - Phase 1: Foundation
   - Creating roadmap and architecture

2. **Next:** [Phase_2_Mission_Planning.md](Phase_2_Mission_Planning.md)
   - Planning Sprint 1 missions
   - Research vs. build decisions
   - Mission file creation

3. **Then:** [Phase_3_Session_Execution.md](Phase_3_Session_Execution.md)
   - Setting up tracking files
   - Executing missions
   - Weekly cycle and sprint reviews

4. **Reference:** This document (CMOS_Overview.md)
   - Understanding the system
   - Quick start guide
   - Troubleshooting

### Templates Available

- `/missions/templates/RESEARCH_TEMPLATE.md` - Research mission template
- `/missions/templates/Build.TechnicalResearch.v1.yaml` - Build mission template
- `/docs/roadmap.md` - Example roadmap (Smart API Client)
- `/docs/technical_architecture.md` - Example architecture (OSS Health Monitor)

### Community & Support

**As CMOS evolves:**
- Documentation will be updated based on real usage
- Templates will be refined
- Best practices will emerge
- Community patterns will develop

**For Now:**
- Follow the documentation step-by-step
- Trust the process (it's been validated)
- Document your learnings
- Iterate on the framework for your context

---

## What Makes CMOS Different?

### Traditional Development
```
Plan (weeks) → Build (months) → Test → Deploy → Discover issues → Repeat
- Time-based estimates often wrong
- Context lost between phases
- Manual handoffs error-prone
- Late discovery of problems
```

### Agile Development
```
2-week sprint → Daily standups → Demo → Retro → Repeat
+ Better than waterfall
+ Regular feedback
- Still time-based
- Manual coordination
- Human bottlenecks
```

### CMOS Approach
```
Foundation → Missions → Execute (automated handoffs) → Review → Adjust → Repeat
+ Session-based (not time-based)
+ Automated handoffs (AI updates files)
+ Continuous validation (per mission)
+ Strategic reviews (per sprint)
+ AI-native workflow
```

**Key Differences:**

1. **Planning Granularity**
   - Traditional: Features → Tasks
   - CMOS: Sprints → Missions (session-scoped)

2. **Time Estimation**
   - Traditional: Hours/days/story points
   - CMOS: Token budgets, mission count

3. **Handoffs**
   - Traditional: Manual (meetings, docs, messages)
   - CMOS: Automated (AI updates 4 files)

4. **Context Persistence**
   - Traditional: Tribal knowledge, wikis, hope
   - CMOS: Structured files, always current

5. **Feedback Loops**
   - Traditional: Sprint reviews, demos
   - CMOS: Mission completion + sprint reviews

---

## The CMOS Promise

**With CMOS, you can:**

✅ **Build faster** - Automated handoffs, no context switching  
✅ **Build smarter** - Research-informed decisions, continuous validation  
✅ **Build consistently** - Structured process, clear missions  
✅ **Build flexibly** - Easy pivots, strategic adjustment points  
✅ **Build solo or team** - Works for individuals or coordinated groups  

**CMOS handles:**
- Mission scoping and sequencing
- Context management across sessions
- Documentation updates
- Progress tracking
- Sprint-to-sprint transitions

**You focus on:**
- Strategic direction (roadmap)
- Technical architecture
- Verifying deliverables
- Making decisions at review points

---

## Next Steps

### Ready to Start?

**1. First-Time Setup**
```bash
# Read Phase 1 guide
cat docs/Getting_Started.md

# Create your foundational documents
# - docs/roadmap.md
# - docs/technical_architecture.md

# When complete, proceed to Phase 2
```

**2. Plan Your First Sprint**
```bash
# Read Phase 2 guide
cat docs/Phase_2_Mission_Planning.md

# Create Sprint 1 mission files
mkdir -p missions/sprint-01/{research,build}

# Fill in mission details from templates

# When complete, proceed to Phase 3
```

**3. Execute and Iterate**
```bash
# Read Phase 3 guide
cat docs/Phase_3_Session_Execution.md

# Set up tracking files (Part 1)
# Execute missions (Part 2)
# Review and plan next sprint (Part 3)

# Repeat the cycle
```

### Questions Before Starting?

Review the **Common Questions** section above, or:
- Re-read the relevant phase documentation
- Check the **Troubleshooting** section
- Review the template examples

### During Your First Sprint

- Follow Phase 3 Part 2 process exactly
- Trust the automated handoffs
- Verify files after each mission
- Take notes on what works/doesn't work
- Adjust your process for Sprint 2

### After Your First Sprint

- Review your sprint summary
- Update your roadmap with learnings
- Refine your mission scoping
- Optimize your templates
- Plan Sprint 2 with new insights

---

## Conclusion

CMOS is a **systematic approach to AI-assisted development** that replaces time-based planning with session-based execution, manual handoffs with automated documentation updates, and ad-hoc processes with structured workflows.

**The framework is simple:**
1. Define vision (Phase 1)
2. Plan missions (Phase 2)
3. Execute with automation (Phase 3)
4. Review and adjust (back to Phase 1)

**The results are powerful:**
- Faster development cycles
- Better context persistence
- Easier team coordination
- Systematic quality improvement
- Flexible iteration

**Start today:**
Read [Getting_Started.md](Getting_Started.md) and create your roadmap. Your first sprint can begin within hours.

---

*CMOS: Context + Mission Orchestration System*  
*Version 1.0*  
*Last Updated: October 2025*
