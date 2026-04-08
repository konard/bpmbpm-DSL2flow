# Architecture of DSL2flow (DSL-WDflow)

## 1. Overview

DSL2flow is a domain-specific language (DSL) system that simultaneously formalizes **workflow** and **docflow** for business processes. From a single DSL description, the system generates:

1. A process diagram in **EPC2 notation** (rendered via Mermaid)
2. **Executable browser JavaScript** code
3. A **state table** tracking both workflow and docflow marker positions

---

## 2. Core Concepts

### 2.1 Workflow

A workflow describes the sequence of **functions** (activities) and **events** (conditions/states) that constitute a business process. It is modeled after the **Event-Driven Process Chain (EPC)** formalism.

Key elements:
- **Event** — a condition that is either the prerequisite or the result of a function. An event "fires" when its condition is true. Events replace explicit AND/OR/XOR gateways: if two event conditions are mutually exclusive, the semantics are XOR; if they can be simultaneously true, the semantics are OR; if a function unconditionally produces multiple outputs, the semantics are AND-split (no event required for the split itself).
- **Function** — an activity performed by a role using a system/tool. It consumes an incoming token (marker) and, when complete, produces an outgoing token.
- **Role** — the actor responsible for executing a function.
- **System/Tool** — the instrument used to execute a function.

### 2.2 Docflow

A docflow describes the **lifecycle of document types** as a state machine. Each document type has a set of states, and functions transition documents between states. The document marker (position in the state graph) is always synchronized with the workflow marker.

Key elements:
- **Document type** — a named class of document (e.g., "LeaveRequest").
- **Document state** — one of the defined states of a document type.
- **Document instance** — a concrete document created during a process instance.
- **State transition** — triggered by the same event that advances the workflow marker.

### 2.3 Synchronization Rule

> The workflow marker transition and the docflow marker transition are triggered by the **same event** — they advance synchronously.

---

## 3. DSL2 Language Specification

### 3.1 Structure

A DSL2 process description has the following top-level sections:

```
process <ProcessName>:
  title: "<Human-readable title>"

  documents:
    <DocumentType>:
      states:
        - <state1>
        - <state2>
        ...

  roles:
    - <RoleName>
    ...

  workflow:
    start: <StartEventName>
    steps:
      - <step definition>
      ...
    end: <EndEventName>
```

### 3.2 Step Definitions

A **function step**:
```
- function <FunctionName>:
    role: <RoleName>
    system: <SystemName>           # optional
    input_doc:                     # optional, list of doc:state pairs (west side of function)
      - <DocType>.<state>
    output_doc:                    # optional
      - <DocType>.<state>
    on_complete:
      - event: <EventName>
        condition: "<boolean expression or description>"  # optional
        next: <FunctionName or end>
```

An **event** triggers the next function or ends the process. If `condition` is omitted, the event fires unconditionally (AND-split semantics for multiple `on_complete` entries).

### 3.3 Implicit Gateway Semantics

| Pattern | How expressed in DSL2 |
|---|---|
| **XOR-split** | Two `on_complete` events with mutually exclusive conditions |
| **OR-split** | Two `on_complete` events with non-exclusive conditions |
| **AND-split** | Multiple `on_complete` entries without conditions |
| **XOR-join / OR-join / AND-join** | Multiple steps pointing to the same next function — the function fires when **its** triggering event fires (EPC semantics) |

---

## 4. EPC2 Notation

EPC2 is an extended form of EPC with the following viewpoints:

### 4.1 Viewpoints

| Viewpoint | Elements shown |
|---|---|
| **Workflow** | Events (hexagons), Functions (rectangles) |
| **Organization** | Roles (ellipses) connected to Functions with dashed lines |
| **System** | Systems/tools (rectangles with rounded corners) connected to Functions |
| **Docflow** | Document states (parallelograms) connected to Functions **on the west (left) side** |

### 4.2 Element Shapes in Mermaid

| EPC2 Element | Mermaid shape |
|---|---|
| Event | `{{EventName}}` (hexagon) |
| Function | `[FunctionName]` (rectangle) |
| Role | `([RoleName])` (stadium/pill) |
| Document state | `[/DocType: state/]` (parallelogram) |
| Control flow | `-->` |
| Docflow (incoming) | `-- in -->` to Function from left |
| Docflow (outgoing) | `-- out -->` from Function to left |
| Role association | `-.->` dashed |

### 4.3 Layout Rules

1. Events and functions alternate in the main control flow (vertical or horizontal chain).
2. Document inputs/outputs are placed to the **west (left)** of their associated function.
3. Role and system annotations appear to the **east (right)** of their function.
4. Gateway operators (AND/OR/XOR) are **not** shown explicitly; the filtering condition lives inside the event element.

---

## 5. Transformation Rules: DSL2 → EPC2 (Mermaid)

### Rule 1 — Start event
```
process P → graph TD; START{{StartEvent}}
```

### Rule 2 — Function node
```
function F → F[F_label]
```

### Rule 3 — Control flow edge
```
event E after function F, before function G →
  F --> E{{E}}
  E{{E}} --> G
```

### Rule 4 — Conditional event label
```
event E with condition C →
  E{{E: C}}
```

### Rule 5 — AND-split (no condition)
```
multiple on_complete without condition →
  F --> G1
  F --> G2
  (direct arrows, no event node)
```

### Rule 6 — Document flow (west side)
```
input_doc D.state_in, output_doc D.state_out →
  D_in[/D: state_in/] -- in --> F
  F -- out --> D_out[/D: state_out/]
```

### Rule 7 — Role annotation
```
role R for function F →
  F -.-> R([R])
```

### Rule 8 — End event
```
end E → E{{EndEvent}} → STOP([END])
```

---

## 6. Transformation Rules: DSL2 → Executable JavaScript

The translator converts DSL2 to a browser-based JS module that implements a **token-passing engine** (analogous to a Petri net / BPMN engine):

### 6.1 Generated Artifacts

| Generated object | Description |
|---|---|
| `ProcessDefinition` | Static description of all nodes and edges |
| `ProcessInstance` | Runtime state: token positions, document states |
| `EventBus` | Pub/sub for synchronizing workflow and docflow |
| `RoleFilter` | Determines which UI actions are available per role |
| UI render functions | Render current state as HTML |

### 6.2 Token Model

- A **workflow token** is a pointer to the current function or event node.
- A **docflow token** is a pointer to the current document state.
- Both tokens advance **atomically** when a function completes.

### 6.3 Function Execution Model

```
User clicks action in role UI
  → function.execute(role, input)
  → validates role permission
  → evaluates output_doc transition
  → evaluates on_complete conditions
  → fires matching event
  → advances workflow token to next function
  → advances docflow token to output_doc state
  → updates state table
  → re-renders UI
```

---

## 7. State Table

The state table captures the full execution trace. Each row represents one **tick** (step) of execution:

| Tick | Function | Role | Workflow Token (from → to) | DocType | Docflow Token (from → to) | Event fired |
|------|----------|------|---------------------------|---------|--------------------------|-------------|
| 1 | SubmitRequest | Applicant | START → SubmitRequest | LeaveRequest | template → submitted | RequestSubmitted |
| 2 | ApproveByManager | Manager | SubmitRequest → ApproveByManager | LeaveRequest | submitted → managerApproved | ManagerApproved |
| ... | ... | ... | ... | ... | ... | ... |

The table is exportable to Excel (`.xlsx`) using the SheetJS library loaded via CDN.

---

## 8. Known Issues and Development Directions

### 8.1 Current Limitations

1. **No parallel branches in UI** — the current token model supports a single active token per workflow.
2. **No loop detection** — cycles in the DSL can cause infinite rendering.
3. **No persistence** — process state exists only in browser memory; page refresh loses state.
4. **Condition evaluation** — conditions in events are string-evaluated via `eval()`, which is a security risk; a proper expression parser should replace this.
5. **Schema validation** — the DSL parser does not fully validate semantic constraints (e.g., referencing undefined document states).

### 8.2 Development Directions

1. **Parallel token support** — extend token model to a token bag (multiset), enabling AND-splits with concurrent execution.
2. **Persistence layer** — save process instance state to `localStorage` or a backend API.
3. **Visual DSL editor** — drag-and-drop EPC2 diagram editor that exports DSL2.
4. **Formal condition language** — replace free-text conditions with a mini-expression language.
5. **Multi-instance processes** — support multiple concurrent process instances.
6. **Role authentication** — integrate with an identity provider for real role enforcement.

---

## 9. File Structure

```
ver1/
├── index.html          — Main application (BPMN-engine UI)
├── translator.js       — DSL2 → JS translator
├── engine.js           — Process execution engine (generated or static)
├── example.dsl2        — Example DSL: leave request approval
├── example_output.js   — Translated JS from example.dsl2
├── architecture_1.md   — This document
├── translator_algo.md  — Translator algorithm description
└── alternatives.md     — Alternative DSL and execution approaches
```
