# DSL2 Translator Algorithm

## Overview

The translator (`translator.js`) performs a **three-phase** transformation pipeline:

```
DSL2 source text
      │
      ▼
  ┌─────────┐
  │  PARSER  │  Phase 1: text → AST (ProcessDefinition object)
  └─────────┘
      │
      ▼
  ┌─────────────────┐
  │ CODE GENERATOR  │  Phase 2a: AST → executable browser JS
  └─────────────────┘
      │
  ┌──────────────────┐
  │ MERMAID GENERATOR│  Phase 2b: AST → EPC2 Mermaid diagram
  └──────────────────┘
```

---

## Phase 1: Parser

### Input
Plain text in DSL2 format (indentation-based, YAML-like).

### Algorithm

1. **Tokenise** — split into lines, strip comments (`#`), normalise whitespace.
2. **Indent tracking** — each line's indent level (number of leading spaces) determines its position in the tree.
3. **Recursive descent**:
   - `parseBlock(baseIndent)` — reads key-value pairs at the current level until the indent drops back to or below `baseIndent`.
   - `parseList(baseIndent)` — reads `- item` entries at the current level.
   - Scalar values (`key: value`) are stored directly.
   - Nested blocks (`key:` followed by deeper lines) recurse into `parseBlock`.
   - List blocks (`key:` followed by `- items`) recurse into `parseList`.
4. **Normalisation** — the raw parsed object is post-processed:
   - `normaliseStep()` extracts function metadata (role, system, input_doc, output_doc, on_complete).
   - `normaliseEvent()` extracts event metadata (event name, condition, output_doc, next function).

### Output
```js
{
  name: "LeaveApproval",
  title: "Leave Request Approval",
  roles: ["Applicant", "Manager", "Director", "Supervisor"],
  documents: {
    LeaveRequest: { states: ["template", "submitted", ...] }
  },
  workflow: {
    start: "ProcessStart",
    end: "ProcessEnd",
    steps: [
      {
        type: "function",
        name: "FillAndSubmit",
        role: "Applicant",
        system: "WebForm",
        input_doc: ["LeaveRequest.template"],
        output_doc: ["LeaveRequest.submitted"],
        on_complete: [
          { event: "RequestSubmitted", condition: null, next: "ApproveByManager" }
        ]
      },
      ...
    ]
  }
}
```

### Complexity
O(n) where n = number of lines. Single pass with a line-pointer cursor.

---

## Phase 2a: JavaScript Code Generator

### Input
`ProcessDefinition` object from Phase 1.

### Algorithm

1. **Serialize definition** — convert the `ProcessDefinition` to JSON; embed it as a constant in the generated code.
2. **Generate runtime** — emit a self-contained IIFE (Immediately Invoked Function Expression) containing:

   a. **`createInstance()`** — initialises runtime state:
      - `currentFunction` ← name of first step
      - `workflowToken` ← start event name
      - `docTokens` ← map of docType → initial state (first state in states list)
      - `history` ← empty array
      - `tick` ← 0

   b. **`execute(role, decision)`** — main execution step:
      1. Validate process is running.
      2. Look up current function definition in `PROCESS_DEF.steps`.
      3. Check role permission (`role === funcDef.role || role === 'Supervisor'`).
      4. Iterate `on_complete` array:
         - If no condition → fire immediately.
         - If condition exists → evaluate via `new Function('decision', 'return (' + condition + ';)')( decision)`.
         - First matching event wins (XOR semantics).
      5. Apply docflow transition:
         - If event specifies `output_doc` → update that doc's token.
         - Else apply step's `output_doc` list.
      6. Update `workflowToken` to event name.
      7. Append tick to `history`.
      8. Advance `currentFunction` to `event.next` (or `null` if `'end'`).
      9. Return result object.

   c. **`getState()`, `getHistory()`, `getDefinition()`** — accessors.

3. **Export** — detect environment (Node.js `module.exports` vs browser `window`).

### Output
Browser-executable JavaScript string (`~150 lines`).

### Condition Evaluation Note
Conditions are evaluated with `new Function(...)`. This is acceptable for a trusted, local DSL but should be replaced with a sandboxed expression evaluator for production use (security risk: arbitrary code execution).

---

## Phase 2b: Mermaid EPC2 Generator

### Input
`ProcessDefinition` object from Phase 1.

### Algorithm

1. **Node declarations** (top section of Mermaid):
   - `START{{startEvent}}` — start event hexagon.
   - For each function step: `FuncName[FuncName]`.
   - For each `on_complete` event: `EventName{{EventName\ncondition}}`.
   - For each `input_doc` and `output_doc`: `D_name_in[/DocType.state/]` parallelogram.
   - `END{{endEvent}}` — end event hexagon.

2. **Edge declarations**:
   - `START --> first_function` — initial control flow.
   - For each step:
     - West docflow: `D_in -- in --> FuncName`
     - East docflow: `FuncName -- out --> D_out`
     - Control flow: `FuncName --> EventName --> next_function_or_END`
     - Role association: `FuncName -.-> Role([Role])` *(optional, separate viewpoint)*

3. **Output** — single `flowchart TD` Mermaid string.

---

## Known Problems

| Problem | Impact | Mitigation |
|---|---|---|
| `eval`/`new Function` for conditions | Security: XSS if DSL comes from user input | Use a safe expression parser (e.g. `expr-eval` library) |
| Single-token workflow model | Cannot represent AND-split (parallel branches) | Extend state to a token multiset (Map of node → count) |
| No loop detection in parser | Infinite cycle in DSL causes infinite render | Add visited-node tracking in `execute()` |
| No full semantic validation | Invalid docflow references silently ignored | Add validation pass after parsing |
| No persistence | State lost on page refresh | Serialize `state` to `localStorage` or IndexedDB |
| Mermaid layout limitations | Complex graphs can be hard to read | Offer LR/TD toggle; use `subgraph` for viewpoints |
| DSL parser is hand-written | Fragile for edge cases | Replace with PEG.js or Ohm grammar |

---

## Development Roadmap

1. **v1.1** — Replace hand-written parser with PEG.js grammar; add full semantic validation.
2. **v1.2** — Parallel token support (AND-split/join); loop detection.
3. **v1.3** — Persist state to `localStorage`; add process instance list.
4. **v2.0** — Visual DSL editor (drag-and-drop EPC2 → DSL2 export); real role authentication.
