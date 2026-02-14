# CMOS Agent Configuration

**Purpose**: Instructions for AI agents working with CMOS project management system.

**Version**: 2.0 (MCP-first architecture)

---

## Quick Start

CMOS operations are performed via MCP tools. No Python CLI required.

```
1. Run cmos_agent_onboard to get project context
2. Run cmos_mission_status to see work queue
3. Start working with cmos_mission_start
```

---

## Available MCP Tools

### Database & Health
| Tool | Description |
|------|-------------|
| `cmos_db_health` | Check database connectivity and stats |
| `cmos_agent_onboard` | Get project context for cold-start |
| `cmos_project_init` | Initialize new CMOS project |

### Mission Management
| Tool | Description |
|------|-------------|
| `cmos_mission_status` | View work queue (In Progress → Current → Queued) |
| `cmos_mission_list` | List missions with filtering |
| `cmos_mission_show` | Get full mission details |
| `cmos_mission_start` | Begin work on a mission |
| `cmos_mission_complete` | Mark mission done |
| `cmos_mission_block` | Block mission with reason |
| `cmos_mission_unblock` | Unblock and resume mission |
| `cmos_mission_update` | Update mission fields |
| `cmos_mission_add` | Create new mission |
| `cmos_mission_depends` | Add mission dependency |

### Sprint Management
| Tool | Description |
|------|-------------|
| `cmos_sprint_list` | List all sprints |
| `cmos_sprint_show` | Get sprint details with missions |
| `cmos_sprint_add` | Create new sprint |
| `cmos_sprint_update` | Update sprint fields |

### Session Management
| Tool | Description |
|------|-------------|
| `cmos_session_start` | Start planning/review/research session |
| `cmos_session_capture` | Capture decisions, learnings, constraints |
| `cmos_session_complete` | Complete session with summary |
| `cmos_session_list` | List session history |

### Context Operations
| Tool | Description |
|------|-------------|
| `cmos_context_view` | View project/master context |
| `cmos_context_snapshot` | Take strategic snapshot |
| `cmos_context_history` | View snapshot timeline |

### Decision Tracking
| Tool | Description |
|------|-------------|
| `cmos_decisions_list` | List strategic decisions |
| `cmos_decisions_search` | Search decisions by keyword |

---

## Mission Lifecycle

```
Queued → Current → In Progress → Completed
                 ↘ Blocked ↗
```

### Selection Priority
1. First mission with status `In Progress`
2. Otherwise, first mission with status `Current`
3. Otherwise, first mission with status `Queued`

---

## Build Session Workflow

### 1. Onboard
```
cmos_agent_onboard()
```
Get project state, pending missions, recent decisions.

### 2. Check Work Queue
```
cmos_mission_status()
```
See what's In Progress, Current, or Queued.

### 3. Start Mission
```
cmos_mission_start(missionId="s16-m01")
```
Transitions to In Progress.

### 4. Execute Work
- Write real code, not stubs
- Create comprehensive tests
- Verify all success criteria met

### 5. Complete Mission
```
cmos_mission_complete(missionId="s16-m01", notes="What was done")
```
Marks completed, logs event.

### 6. If Blocked
```
cmos_mission_block(missionId="s16-m01", reason="Why blocked", blockers=["what's needed"])
```

---

## Session Workflow

For planning, research, or review work (not mission execution):

### Start Session
```
cmos_session_start(type="planning", title="Sprint 17 Planning")
```

### Capture Insights
```
cmos_session_capture(category="decision", content="Chose X over Y because...")
cmos_session_capture(category="learning", content="Discovered that...")
cmos_session_capture(category="constraint", content="Must avoid...")
```

Categories: `decision`, `learning`, `constraint`, `context`, `next-step`

### Complete Session
```
cmos_session_complete(summary="What was accomplished", nextSteps=["Action 1", "Action 2"])
```

---

## Context Management

### Two Contexts
- **project_context**: Current session state, working memory
- **master_context**: Project history, strategic decisions, constraints

### Strategic Snapshots
Take snapshots at milestones:
```
cmos_context_snapshot(contextType="master_context", source="Sprint 16 completed")
```

---

## Key Principles

1. **MCP-first**: Use CMOS tools directly, no CLI required
2. **Database is source of truth**: All state in SQLite at `cmos/db/cmos.sqlite`
3. **Session captures**: Record decisions and learnings during work
4. **Context snapshots**: Preserve strategic milestones
5. **Verify state**: Check `cmos_mission_status` after operations

---

## TraceLab Integration

CMOS missions can reference TraceLab research artifacts using TraceLab URIs. This enables a research-to-build workflow where discoveries inform implementation.

### TraceLab URI Format

```
tracelab://<type>/<resource-id>[/<path>]
```

### URI Types

| Type | Description | Example |
|------|-------------|---------|
| `project` | TraceLab project | `tracelab://project/abc123` |
| `collection` | Research collection | `tracelab://collection/abc123` |
| `report` | Synthesized report | `tracelab://report/abc123` |
| `document` | Ingested document | `tracelab://document/abc123` |
| `chunk` | Specific knowledge chunk | `tracelab://chunk/abc123` |
| `search` | Saved search query | `tracelab://search/market-trends` |

### Using TraceLab References in Missions

Add TraceLab URIs to a mission's `reference_docs` field:

```yaml
- id: s18-m05
  name: Implement Authentication Flow
  reference_docs:
    - tracelab://report/auth-research-report
    - tracelab://collection/security-best-practices
    - tracelab://chunk/oauth2-implementation-notes
    - docs/api-spec.md
```

### Resolving References

Use `cmos_resolve_references` to parse mission references:

```
cmos_resolve_references(missionId="s18-m05")

Returns:
{
  tracelabRefs: [
    { type: "report", resourceId: "auth-research-report" },
    { type: "collection", resourceId: "security-best-practices" },
    { type: "chunk", resourceId: "oauth2-implementation-notes" }
  ],
  localDocs: [{ path: "docs/api-spec.md" }],
  webUrls: []
}
```

Then use TraceLab MCP tools to fetch content:
- `search_knowledge` - Find relevant chunks
- `get_document_content` - Read full documents
- `get_collection` - Get collection details
- `get_report` - Read synthesized reports

### Decision Provenance

When capturing decisions informed by research, include source chunks:

```
cmos_session_capture(
  category="decision",
  content="Use OAuth2 PKCE flow for mobile clients",
  sourceChunkIds=["chunk-uuid-1", "chunk-uuid-2"]
)
```

This creates a traceable link from decision to research.

---

## Research → Reference → Build Workflow

### 1. Research Phase

Use TraceLab to gather and synthesize information:

```
# Search for relevant knowledge
search_knowledge(query="authentication best practices")

# Collect relevant chunks
create_collection(name="Auth Research")
add_to_collection(collectionId="...", chunkId="...")

# Synthesize findings
synthesize(collectionId="...", prompt="Summarize auth approaches")
```

### 2. Reference Phase

Create a mission referencing the research:

```
cmos_mission_add(
  missionId="s18-m05",
  name="Implement Authentication",
  sprintId="sprint-18",
  objective="Implement secure auth flow based on research findings",
  referenceDocs=[
    "tracelab://report/auth-research",
    "tracelab://collection/auth-collection"
  ]
)
```

### 3. Build Phase

During implementation, resolve and use references:

```
# Get categorized references
cmos_resolve_references(missionId="s18-m05")

# Fetch TraceLab content as needed
get_report(reportId="auth-research")

# Capture implementation decisions with provenance
cmos_session_capture(
  category="decision",
  content="Chose PKCE over implicit flow",
  sourceChunkIds=["chunk-xyz"]
)
```

---

## Directory Structure

```
project/
└── cmos/
    ├── db/
    │   └── cmos.sqlite    # All CMOS state
    ├── agents.md          # This file
    └── docs/              # Optional documentation
```

---

**Last Updated**: 2025-12-29
**Schema Version**: 2.0
