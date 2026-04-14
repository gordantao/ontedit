# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OntEdit is a web-based ontology metadata editor. It loads a merged v4-format ontology (output from the `generate_merged_suggestions.ipynb` pipeline or from the OntMerge webapp) and lets users browse the concept hierarchy and edit per-concept metadata: names, synonyms, ICD codes, primary references, and related concepts. Edits are tracked per-session and exported back as a valid v4 JSON file.

**Relationship to sibling apps:**
- `generate_merged_suggestions.ipynb` — Python/Gemini pipeline that produces `ontmerge/data/suggested_merge.json` (v4 format)
- `ontmerge/` — Drag-and-drop merge tool for two source ontologies; exports edited v4 JSON
- `ontedit/` — **This app.** Takes the final merged v4 JSON and allows metadata editing

**Typical workflow:**
```
PathOut v4 + WHO v4
       ↓ (notebook)
suggested_merge.json
       ↓ (ontmerge webapp)
ontology.json (reviewed/edited)
       ↓ (ontedit webapp)
ontology.json (metadata enriched)
```

## Commands

```bash
npm run dev          # Start dev server (Vite, default port 5173)
npm run dev -- --port 5174  # Start on specific port
npm run build        # Production build
npm run preview      # Preview production build
npm run check        # Type-check (svelte-kit sync + svelte-check)
npm run check:watch  # Type-check in watch mode
```

No test runner or linter is configured.

## Tech Stack

- **Svelte 5** with runes (`$state`, `$derived`, `$effect`, `$props`)
- **SvelteKit 2** with `adapter-auto`
- **TypeScript 5** (strict mode)
- **`@types/node`** for `fs/promises` in the server load function
- No Tailwind, no shadcn — plain scoped CSS in `+page.svelte` and global CSS in `+layout.svelte`

## Architecture

### Data Flow

```
data/ontology.json → +page.server.ts load() → +page.svelte (ontology)
```

Server (`+page.server.ts`) reads `data/ontology.json`, parses it as `V4OntologyFile`, and returns the full object to the client. All state and edit logic lives client-side in `+page.svelte`.

### File Structure

```
ontedit/
├── data/
│   └── ontology.json          # v4 merged ontology (input + export target)
├── src/
│   └── routes/
│       ├── +layout.svelte     # Global dark-theme CSS reset, scrollbar styles
│       ├── +page.server.ts    # Loads data/ontology.json; exports types
│       └── +page.svelte       # Entire app UI (~550 lines)
├── CLAUDE.md                  # This file
├── package.json
├── svelte.config.js
├── tsconfig.json
└── vite.config.ts
```

### Key Types (from `+page.server.ts`)

```typescript
interface ConceptMeta {
  name: string;
  synonyms: string[];
  icd_codes: (string | [string, string])[];  // PathOut = string, WHO = tuple
  primary_reference: string | null;
  related_concepts: string[];
  source: string;           // "pathout" | "who" | "merged"
  createdBy?: string;       // "llm" for LLM-created concepts
  mergedFrom?: string[];    // IDs of source concepts if merged
}

interface V4StructureNode {
  children: Record<string, V4StructureNode> | string[];
  // dict of children (inner nodes) OR string[] of leaf IDs
}

interface V4OntologyFile {
  version: 4;
  format: string;
  metadata: Record<string, unknown>;
  concepts: Record<string, ConceptMeta>;  // ID → metadata
  structure: Record<string, V4StructureNode>;  // ID-keyed tree
  lineage?: Record<string, unknown>;
  mergeHistory?: unknown[];
  sourceOntologies?: Record<string, unknown>;
  ontologies?: Record<string, unknown>;  // v2-exported files use this key
}
```

### State in `+page.svelte`

| Variable | Type | Purpose |
|---|---|---|
| `concepts` | `$state<Record<string, ConceptMeta>>` | Mutable copy of concept registry; updated on save |
| `structure` | `const` (from server) | ID-keyed tree; never mutated |
| `selectedId` | `$state<string \| null>` | Currently selected concept ID |
| `expanded` | `$state<Set<string>>` | Set of expanded tree node IDs |
| `searchQuery` | `$state<string>` | Current search input value |
| `editName` | `$state<string>` | Scratch field for name edits |
| `editSynonyms` | `$state<string[]>` | Scratch field for synonym edits |
| `editIcdCodes` | `$state<(string | [string, string])[]>` | Scratch field for ICD code edits |
| `editPrimaryRef` | `$state<string>` | Scratch field for reference edits |
| `editRelated` | `$state<string[]>` | Scratch field for related concept edits |
| `newSynonym` | `$state<string>` | Scratch input for new synonym entry |
| `newRelated` | `$state<string>` | Scratch input for new related concept entry |
| `newIcdFormat` | `$state<"string" \| "tuple">` | Toggle for the ICD add-form (plain string vs. type+code tuple) |
| `newIcdString` | `$state<string>` | Scratch input for plain-string ICD entry |
| `newIcdTupleType` | `$state<string>` | Scratch type selector for tuple ICD entry (`"icdO"` default) |
| `newIcdTupleValue` | `$state<string>` | Scratch value input for tuple ICD entry |
| `modifiedIds` | `$state<Set<string>>` | Tracks which concepts have unsaved/saved edits |

**Edit fields are "scratch" state** — they are populated by a `$effect` when `selectedConcept` changes, and written back to `concepts` only on explicit Save.

### Key Derived Values

| Variable | Purpose |
|---|---|
| `selectedConcept` | `concepts[selectedId]` – current concept metadata |
| `stats()` | Counts concepts by source (pathout / who / merged / other) |
| `searchResults()` | Filtered list of matching concepts (max 200) |
| `unsaved` | `true` when scratch fields differ from saved concept |

### Tree Rendering

The tree is rendered by a recursive Svelte snippet `renderTree(nodes, depth)`. It handles two node types:
- **Inner nodes**: `children` is `Record<string, V4StructureNode>` → recurse
- **Leaf arrays**: `children` is `string[]` (list of concept IDs) → render as flat list one level deeper

Each node shows:
- Expand/collapse toggle (only if `childCount > 0`)
- Colored dot indicating source (`src-pathout` = blue, `src-who` = green, `src-merged` = purple)
- Display name (resolved from `concepts[id].name`)
- Child count badge
- Gold `•` dot (via CSS `::after`) if the concept is in `modifiedIds`

### Search

Search filters `concepts` entries by name or synonym substring match. Results are rendered as a flat list with the concept ID shown alongside the name. Press Escape to clear.

### Export

`exportOntology()` builds an updated v4 object by spreading `data.ontology` with the mutated `concepts` map and updated `metadata.notes` / `editedAt` / `modifiedConcepts` fields. Downloads as `ontology.json` via a temporary anchor element.

### ICD Code Format

ICD codes are stored in two formats across the two source ontologies:
- **PathOut**: plain string, e.g. `"ICD9/10: D56.0 - alpha thalassemia"`
- **WHO**: `[type, code]` tuple, e.g. `["icdO", "8000/3"]`

`formatIcdCode(code)` renders both: tuples become `[type] code`, strings pass through unchanged. ICD codes are **read-only** in the editor (editing them is deferred).

---

## v4 Ontology Format Reference

See `ontmerge/CLAUDE.md` for the full format specification. The key fields used by OntEdit:

```json
{
  "version": 4,
  "metadata": { "source": "...", "notes": "...", "sessionId": "..." },
  "concepts": {
    "<PATHOUT-123>": {
      "name": "alpha thalassemia",
      "synonyms": ["α-thalassemia minima"],
      "icd_codes": ["ICD9/10: D56.0"],
      "primary_reference": "https://...",
      "related_concepts": [],
      "source": "pathout"
    }
  },
  "structure": {
    "<MERGED-abc>": {
      "children": {
        "<PATHOUT-100>": {
          "children": ["<PATHOUT-101>", "<PATHOUT-102>"]
        }
      }
    }
  }
}
```

**ID conventions:**
| Prefix | Source |
|---|---|
| `<PATHOUT-N>` | PathologyOutlines source ontology |
| `<WHO-N>` | WHO Classification of Tumours source ontology |
| `<MERGED-uuid>` | Created during merge (LLM or user) |
| `<LLM-uuid>` | Created by LLM pipeline |

---

## Planned Features (not yet implemented)

- **ICD code editing** — add/remove ICD codes with format picker (plain string vs. `[type, value]` tuple). Type selector pre-populated with `icdO`, `icd11`, `icd10`, `icd9`. Enter key submits. ✅ Done
- **Concept renaming propagated to structure** — currently renaming a concept only updates `concepts[id].name`; structure keys remain IDs (which is correct for v4), but downstream name-resolution already reads from `concepts`, so this works correctly already
- **Click-to-navigate related concepts** — clicking a related concept string could select it in the tree
- **Lineage viewer** — show the `lineage` entries for a selected concept (provenance from source ontologies)
- **Merge history inspector** — surface `mergeHistory` array entries in the UI
- **Dirty-state persistence** — use `localStorage` to survive page refreshes without losing edits
- **Bulk search-and-replace** — rename a synonym or reference across multiple concepts at once
- **Import from file** — allow uploading a new `ontology.json` without restarting the server
