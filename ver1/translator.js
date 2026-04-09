/**
 * DSL2 → JavaScript Translator
 *
 * Translates a DSL2 process description (string) into:
 *   1. A ProcessDefinition object (static structure)
 *   2. Executable browser JavaScript source code (string)
 *   3. An EPC2 Mermaid diagram (string)
 *
 * Entry point:  DSL2Translator.translate(dsl2Source)
 * Returns:      { definition, jsCode, mermaidCode }
 */

const DSL2Translator = (() => {
  /* ------------------------------------------------------------------ */
  /* 1.  PARSER                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * Minimal indentation-aware YAML-like parser for DSL2.
   * Returns a plain JS object representing the process definition.
   */
  function parse(src) {
    // Normalise line endings and strip comment lines
    const lines = src
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map(l => l.replace(/#.*$/, '').trimEnd());

    const process = {};
    let i = 0;

    function indent(line) {
      return line.length - line.trimStart().length;
    }

    function peek() { return lines[i]; }
    function next() { return lines[i++]; }

    function skipBlanks() {
      while (i < lines.length && lines[i].trim() === '') i++;
    }

    // Parse top-level "process <Name>:"
    skipBlanks();
    const procMatch = next().match(/^process\s+(\S+)\s*:/);
    if (!procMatch) throw new Error('DSL2 must start with "process <Name>:"');
    process.name = procMatch[1];
    process.documents = {};
    process.roles = [];
    process.workflow = { steps: [] };

    // Helper: current line's base indent
    function parseBlock(baseIndent) {
      const obj = {};
      while (i < lines.length) {
        skipBlanks();
        if (i >= lines.length) break;
        const line = peek();
        if (line.trim() === '') { i++; continue; }
        const ind = indent(line);
        if (ind <= baseIndent) break; // dedent → back to parent

        const trimmed = line.trim();
        i++;

        // List item
        if (trimmed.startsWith('- ')) {
          // handled by caller
          i--;
          break;
        }

        // Key: value  OR  Key:
        const kv = trimmed.match(/^([\w\s.]+?)\s*:\s*(.*)$/);
        if (!kv) continue;
        const key = kv[1].trim();
        const val = kv[2].trim();

        if (val !== '') {
          obj[key] = unquote(val);
        } else {
          // nested block or list
          skipBlanks();
          if (i < lines.length && peek().trim().startsWith('- ')) {
            obj[key] = parseList(ind);
          } else {
            obj[key] = parseBlock(ind);
          }
        }
      }
      return obj;
    }

    function parseList(baseIndent) {
      const arr = [];
      while (i < lines.length) {
        skipBlanks();
        if (i >= lines.length) break;
        const line = peek();
        if (line.trim() === '') { i++; continue; }
        const ind = indent(line);
        if (ind <= baseIndent) break;

        const trimmed = line.trim();
        if (!trimmed.startsWith('- ')) break;

        i++;
        const rest = trimmed.slice(2).trim();

        // List item might be a scalar or an inline map "key: value"
        if (rest.includes(':')) {
          // Could be "function Foo:" or "event E:"
          const km = rest.match(/^(\w+)\s+(\S+)\s*:$/);
          if (km) {
            // e.g.  "- function FillAndSubmit:"
            const item = { _type: km[1], _name: km[2] };
            skipBlanks();
            const itemInd = i < lines.length ? indent(peek()) : 0;
            Object.assign(item, parseBlock(itemInd - 1));
            arr.push(item);
          } else {
            // e.g.  "- event: RequestSubmitted"  или  "- event: ManagerApproved" с подсвойствами
            const kvMatch = rest.match(/^([\w_]+)\s*:\s*(.+)$/);
            if (kvMatch) {
              const item = { [kvMatch[1]]: unquote(kvMatch[2].trim()) };
              // Читаем дополнительные подсвойства (condition, next, output_doc и т.д.)
              skipBlanks();
              if (i < lines.length) {
                const nextInd = indent(peek());
                if (nextInd > ind && !peek().trim().startsWith('- ')) {
                  Object.assign(item, parseBlock(nextInd - 1));
                }
              }
              arr.push(item);
            } else {
              arr.push(rest);
            }
          }
        } else {
          arr.push(rest);
        }
      }
      return arr;
    }

    function unquote(s) {
      if ((s.startsWith('"') && s.endsWith('"')) ||
          (s.startsWith("'") && s.endsWith("'"))) {
        return s.slice(1, -1);
      }
      return s;
    }

    // Parse body of process
    const body = parseBlock(0);
    if (body.title) process.title = body.title;

    // Documents
    if (body.documents) {
      for (const [docName, docDef] of Object.entries(body.documents)) {
        process.documents[docName] = {
          states: Array.isArray(docDef.states) ? docDef.states : []
        };
      }
    }

    // Roles
    if (Array.isArray(body.roles)) {
      process.roles = body.roles;
    }

    // Workflow
    if (body.workflow) {
      process.workflow.start = body.workflow.start || 'ProcessStart';
      process.workflow.end = body.workflow.end || 'ProcessEnd';
      const rawSteps = body.workflow.steps;
      if (Array.isArray(rawSteps)) {
        process.workflow.steps = rawSteps.map(normaliseStep);
      }
    }

    return process;
  }

  function normaliseStep(raw) {
    if (raw._type === 'function') {
      return {
        type: 'function',
        name: raw._name,
        role: raw.role || 'System',
        system: raw.system || null,
        input_doc: Array.isArray(raw['input_doc']) ? raw['input_doc'] : [],
        output_doc: Array.isArray(raw['output_doc']) ? raw['output_doc'] : [],
        on_complete: Array.isArray(raw['on_complete'])
          ? raw['on_complete'].map(normaliseEvent)
          : []
      };
    }
    return raw;
  }

  function normaliseEvent(raw) {
    if (typeof raw === 'object') {
      return {
        event: raw.event || raw['- event'] || '',
        condition: raw.condition || null,
        output_doc: raw.output_doc || null,
        next: raw.next || 'end'
      };
    }
    return { event: String(raw), condition: null, output_doc: null, next: 'end' };
  }

  /* ------------------------------------------------------------------ */
  /* 2.  MERMAID / EPC2 GENERATOR                                        */
  /* ------------------------------------------------------------------ */

  function generateMermaid(def) {
    const lines = ['flowchart TD'];

    // Start
    lines.push(`    START{{${def.workflow.start}}}`);

    const docNodes = new Set();

    for (const step of def.workflow.steps) {
      if (step.type !== 'function') continue;

      lines.push(`    ${step.name}[${step.name}]`);

      // Events
      for (const oc of step.on_complete) {
        const label = oc.condition
          ? `${oc.event}\\n${oc.condition}`
          : oc.event;
        lines.push(`    ${oc.event}{{${label}}}`);
      }

      // Document state nodes
      for (const d of step.input_doc) {
        const id = docNodeId(d, 'in');
        if (!docNodes.has(id)) {
          lines.push(`    ${id}[/${d}/]`);
          docNodes.add(id);
        }
      }
      for (const d of step.output_doc) {
        const id = docNodeId(d, 'out');
        if (!docNodes.has(id)) {
          lines.push(`    ${id}[/${d}/]`);
          docNodes.add(id);
        }
      }
    }

    lines.push(`    END{{${def.workflow.end}}}`);
    lines.push('');

    // --- Edges ---

    // Connect start to first function
    if (def.workflow.steps.length > 0) {
      const first = def.workflow.steps[0];
      if (first.type === 'function') {
        lines.push(`    START --> ${first.name}`);
      }
    }

    for (const step of def.workflow.steps) {
      if (step.type !== 'function') continue;

      // Docflow west side
      for (const d of step.input_doc) {
        lines.push(`    ${docNodeId(d, 'in')} -- in --> ${step.name}`);
      }
      for (const d of step.output_doc) {
        lines.push(`    ${step.name} -- out --> ${docNodeId(d, 'out')}`);
      }

      // Control flow via events
      for (const oc of step.on_complete) {
        lines.push(`    ${step.name} --> ${oc.event}`);
        if (oc.next === 'end') {
          lines.push(`    ${oc.event} --> END`);
        } else {
          lines.push(`    ${oc.event} --> ${oc.next}`);
        }
      }
    }

    return lines.join('\n');
  }

  function docNodeId(docState, dir) {
    return 'D_' + docState.replace(/[^a-zA-Z0-9]/g, '_') + '_' + dir;
  }

  /* ------------------------------------------------------------------ */
  /* 3.  JS CODE GENERATOR                                                */
  /* ------------------------------------------------------------------ */

  function generateJS(def) {
    const name = def.name;
    const steps = def.workflow.steps.filter(s => s.type === 'function');

    const docTypes = Object.entries(def.documents).map(([docName, docDef]) => ({
      name: docName,
      states: docDef.states
    }));

    // Build initial document states map (first state = initial)
    const initDocStates = {};
    for (const dt of docTypes) {
      initDocStates[dt.name] = dt.states[0] || null;
    }

    const defJSON = JSON.stringify({
      name,
      title: def.title,
      roles: def.roles,
      documents: def.documents,
      startEvent: def.workflow.start,
      endEvent: def.workflow.end,
      steps: steps
    }, null, 2);

    return `// Auto-generated by DSL2Translator from ${name}.dsl2
// Process: ${def.title || name}

(function() {
  'use strict';

  /* ---- Process Definition ---- */
  const PROCESS_DEF = ${defJSON};

  /* ---- Runtime State ---- */
  let state = null;

  function createInstance() {
    state = {
      tick: 0,
      currentFunction: PROCESS_DEF.steps.length > 0 ? PROCESS_DEF.steps[0].name : null,
      workflowToken: PROCESS_DEF.startEvent,
      docTokens: ${JSON.stringify(initDocStates, null, 6)},
      history: [],
      finished: false
    };
    logTick('(init)', null, PROCESS_DEF.startEvent, null);
    return state;
  }

  function logTick(funcName, role, eventFired, docTransitions) {
    state.history.push({
      tick: state.tick,
      function: funcName,
      role: role,
      workflowTokenBefore: state.workflowToken,
      workflowTokenAfter: eventFired,
      docTransitions: docTransitions || {},
      eventFired: eventFired
    });
    state.tick++;
  }

  /**
   * Execute the current function.
   * @param {string} role - The role executing the function.
   * @param {string} decision - 'approved' | 'rejected' | any decision string.
   * @returns {{ ok: boolean, event: string, error: string }}
   */
  function execute(role, decision) {
    if (!state || state.finished) {
      return { ok: false, error: 'Process not started or already finished.' };
    }

    const funcDef = PROCESS_DEF.steps.find(s => s.name === state.currentFunction);
    if (!funcDef) {
      return { ok: false, error: 'No active function: ' + state.currentFunction };
    }

    // Role check (Supervisor can do anything)
    const allowedRole = funcDef.role;
    if (allowedRole !== 'System' && role !== allowedRole && role !== 'Supervisor') {
      return { ok: false, error: 'Role "' + role + '" cannot execute "' + funcDef.name + '" (requires "' + allowedRole + '").' };
    }

    // Evaluate on_complete conditions
    let firedEvent = null;
    for (const oc of funcDef.on_complete) {
      if (!oc.condition) {
        firedEvent = oc;
        break;
      }
      // Simple condition evaluation: supports "decision == 'value'"
      try {
        /* jshint ignore:start */
        const result = (new Function('decision', 'return (' + oc.condition + ');'))(decision);
        /* jshint ignore:end */
        if (result) {
          firedEvent = oc;
          break;
        }
      } catch (e) {
        // condition evaluation failed, skip
      }
    }

    if (!firedEvent) {
      return { ok: false, error: 'No matching event for decision: ' + decision };
    }

    // Apply docflow transition
    const docTransitions = {};
    if (firedEvent.output_doc) {
      const [docType, docState] = firedEvent.output_doc.split('.');
      if (docType && docState) {
        const prev = state.docTokens[docType];
        state.docTokens[docType] = docState;
        docTransitions[docType] = { from: prev, to: docState };
      }
    } else {
      // Apply generic output_doc from step definition (first one)
      for (const od of funcDef.output_doc) {
        const [docType, docState] = od.split('.');
        if (docType && docState && !docTransitions[docType]) {
          const prev = state.docTokens[docType];
          state.docTokens[docType] = docState;
          docTransitions[docType] = { from: prev, to: docState };
        }
      }
    }

    const prevToken = state.workflowToken;
    state.workflowToken = firedEvent.event;

    logTick(funcDef.name, role, firedEvent.event, docTransitions);

    // Advance to next function
    if (firedEvent.next === 'end') {
      state.currentFunction = null;
      state.finished = true;
      state.workflowToken = PROCESS_DEF.endEvent;
    } else {
      state.currentFunction = firedEvent.next;
      state.workflowToken = firedEvent.next;
    }

    return {
      ok: true,
      event: firedEvent.event,
      nextFunction: state.currentFunction,
      docTokens: { ...state.docTokens },
      finished: state.finished
    };
  }

  function getState() { return state ? { ...state } : null; }
  function getHistory() { return state ? [...state.history] : []; }
  function getDefinition() { return PROCESS_DEF; }

  /* ---- Export as global ---- */
  const engine = { createInstance, execute, getState, getHistory, getDefinition };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = engine;
  } else {
    window['${name}Engine'] = engine;
  }
})();
`;
  }

  /* ------------------------------------------------------------------ */
  /* 4.  PUBLIC API                                                       */
  /* ------------------------------------------------------------------ */

  function translate(dsl2Source) {
    const definition = parse(dsl2Source);
    const jsCode = generateJS(definition);
    const mermaidCode = generateMermaid(definition);
    return { definition, jsCode, mermaidCode };
  }

  // Export
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { translate, parse, generateJS, generateMermaid };
  } else {
    window.DSL2Translator = { translate, parse, generateJS, generateMermaid };
  }
})();
