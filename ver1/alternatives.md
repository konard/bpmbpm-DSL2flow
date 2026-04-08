# Alternative Approaches

## 1. Alternative DSL Designs

### 1.1 YAML-based DSL
**What it is:** Use plain YAML as the DSL syntax instead of a custom indentation language.

**What can be borrowed:** Standard YAML parsers (js-yaml, PyYAML) handle all tokenisation and nesting; the author only defines the schema.

**Advantages:**
- Mature parsers, no hand-written tokeniser.
- Wide tooling: syntax highlighting, linters, JSON Schema validation.
- Easy round-trip (YAML ↔ JSON ↔ object).

**Disadvantages:**
- YAML quirks (Norway problem, implicit type coercion) can surprise DSL authors.
- Schema still needs custom validation layer.
- Less readable for non-technical domain experts than a bespoke English-like DSL.

---

### 1.2 JSON-based DSL
**What it is:** Describe the process as a JSON object following a defined JSON Schema.

**What can be borrowed:** JSON Schema validators (ajv); process definition format borrowed from BPMN-JSON (Camunda's JSON export) or AWS Step Functions' Amazon States Language (ASL).

**Advantages:**
- Universally parseable; native in JavaScript.
- Strict schema validation out of the box.
- Programmatically generatable by other tools.

**Disadvantages:**
- Verbose and not human-friendly for authoring.
- Not suitable as a "readable text description" per the issue requirements.

---

### 1.3 Petri Net–based DSL (PNML subset)
**What it is:** Describe processes using Petri Net Markup Language (PNML) or a custom text syntax derived from Petri net theory (places, transitions, arcs).

**What can be borrowed:** Workflow Patterns catalogue (www.workflowpatterns.com) maps directly to Petri net patterns. Token semantics are formally defined.

**Advantages:**
- Formal mathematical foundation; all workflow patterns (WP1–WP43) can be expressed.
- AND-split/join, OR-split/join, XOR naturally fall out of the Petri net structure.
- Existing Petri net simulators can be reused.

**Disadvantages:**
- Petri net notation is unfamiliar to business analysts.
- Harder to read as a "human description".
- Docflow integration requires layering on top of standard Petri net semantics.

---

### 1.4 Declarative Rule-based DSL
**What it is:** Define process logic as a set of production rules: `WHEN <condition> AND <state> THEN <action> CAUSES <state'>`.

**What can be borrowed:** CLIPS/Drools rule engine syntax; SBVR (Semantics of Business Vocabulary and Rules) standard.

**Advantages:**
- Very close to natural language.
- Easy to add new rules without restructuring the whole process.

**Disadvantages:**
- Harder to derive a sequential EPC diagram (non-linear rule firing order).
- Rule conflict resolution is non-trivial.

---

### 1.5 BPEL/BPML-inspired Structured DSL
**What it is:** Hierarchical structured language (like BPEL or jBPM's jDSL) with explicit `sequence`, `if`, `while`, `parallel` constructs.

**What can be borrowed:** jBPM's jDSL syntax; Activiti's XML process definition.

**Advantages:**
- Explicit control flow; easy to compile to executable code.
- Well-understood by enterprise developers.

**Disadvantages:**
- Verbose; requires knowledge of process programming constructs.
- Departs from EPC event-driven philosophy.

---

## 2. Alternative Execution & Visualisation Approaches

### 2.1 State Machine Library (XState)
**What it is:** Use [XState](https://xstate.js.org/) — a JavaScript state machine/statechart library — as the execution engine instead of writing a custom token-passing engine.

**Advantages:**
- Production-grade state machine with parallel states, history states, guards.
- Visualizer built-in (`@xstate/inspect`).
- DSL2 could be compiled to an XState machine definition (JSON).

**Disadvantages:**
- Adds a dependency; statechart semantics differ from EPC token semantics.
- Docflow integration requires custom extensions.

---

### 2.2 Petri Net Engine (petri-net-runner)
**What it is:** Use a Petri net execution library (e.g., `petri-net-runner`, `pflow`) to execute the token-passing logic.

**Advantages:**
- Formally correct AND/OR/XOR semantics.
- Concurrent token support (AND-split).
- Reachability analysis and deadlock detection possible.

**Disadvantages:**
- Petri net concepts require developer familiarity.
- Extra translation layer: DSL2 → Petri net definition → execution.

---

### 2.3 Flowchart-based Visualisation (GoJS / JointJS)
**What it is:** Use a commercial or open-source diagramming library to render EPC2 as an interactive diagram instead of using Mermaid.

**Advantages:**
- Interactive: clickable nodes, drag-and-drop editing, zoom/pan.
- Can highlight the active token position in real time.
- More control over layout (west-side docflow, east-side roles).

**Disadvantages:**
- GoJS requires a commercial licence for production use.
- Significantly more complex setup than Mermaid.

---

### 2.4 D3.js-based Custom Renderer
**What it is:** Build a custom EPC2 renderer using D3.js force-directed or hierarchical layout.

**Advantages:**
- Full control over visual layout and animation.
- Can animate token movement between nodes.
- No licensing cost.

**Disadvantages:**
- Significant development effort.
- D3 learning curve.

---

### 2.5 Serverless Back-End (Durable Functions / Step Functions)
**What it is:** Deploy the process engine as serverless functions (Azure Durable Functions, AWS Step Functions) rather than pure browser JS.

**Advantages:**
- Persistent execution across page reloads.
- Scalable, auditable, transactional.
- Built-in retry, timeout, and error handling.

**Disadvantages:**
- Requires cloud infrastructure and backend deployment.
- Contradicts the "runs on GitHub Pages" requirement (browser-only).

---

## 3. Summary Recommendation

For the current **GitHub Pages, browser-only** requirement, the best combination is:

| Concern | Recommended approach | Alternatives |
|---|---|---|
| DSL syntax | Custom indentation DSL2 (current) | YAML-based DSL |
| Parsing | Hand-written recursive descent | PEG.js grammar |
| Execution | Custom token engine (current) | XState |
| Visualisation | Mermaid (current) | GoJS, D3.js |
| Excel export | SheetJS / xlsx (current) | Papa Parse CSV |
| Persistence | localStorage | IndexedDB |
| Patterns expressible | WP1-WP6 (basic sequence, XOR, OR) | Petri net for full WP1-WP43 |
