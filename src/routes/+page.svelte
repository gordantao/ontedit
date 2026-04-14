<script lang="ts">
  // ─── Types ──────────────────────────────────────────────────────────────────

  interface ConceptMeta {
    name: string;
    synonyms: string[];
    icd_codes: (string | [string, string])[];
    primary_reference: string | null;
    related_concepts: string[];
    source: string;
    createdBy?: string;
    mergedFrom?: string[];
  }

  interface V4StructureNode {
    children: Record<string, V4StructureNode> | string[];
  }

  interface V4OntologyFile {
    version: 4;
    format: string;
    metadata: Record<string, unknown>;
    concepts: Record<string, ConceptMeta>;
    structure: Record<string, V4StructureNode>;
    annotations?: Record<string, string>;
    lineage?: Record<string, unknown>;
    mergeHistory?: unknown[];
    sourceOntologies?: Record<string, unknown>;
    ontologies?: Record<string, unknown>;
  }

  let { data }: { data: { ontology: V4OntologyFile | null } } = $props();

  // Raw ontology object (used for export spread)
  let rawOntology = $state<V4OntologyFile | null>(data.ontology ?? null);

  // ── Core state ──────────────────────────────────────────────────────────────
  let concepts = $state<Record<string, ConceptMeta>>(
    data.ontology ? { ...data.ontology.concepts } : {},
  );
  let structure = $state<Record<string, V4StructureNode>>(
    data.ontology ? JSON.parse(JSON.stringify(data.ontology.structure)) : {},
  );

  let selectedId = $state<string | null>(null);
  let expanded = $state(new Set<string>());
  let searchQuery = $state("");

  // Edit fields (mirror of selected concept, editable)
  let editName = $state("");
  let editSynonyms = $state<string[]>([]);
  let editIcdCodes = $state<(string | [string, string])[]>([]);
  let editPrimaryRef = $state("");
  let editRelated = $state<string[]>([]);
  let newSynonym = $state("");
  let newRelated = $state("");

  // New ICD code entry
  let newIcdFormat = $state<"string" | "tuple">("string");
  let newIcdString = $state("");
  let newIcdTupleType = $state("icdO");
  let newIcdTupleValue = $state("");

  // Track which concepts have been modified
  let modifiedIds = $state(new Set<string>());

  // ── Annotations ──────────────────────────────────────────────────────────────
  let annotations = $state<Record<string, string>>({
    ...(data.ontology?.annotations ?? {}),
  });
  let editAnnotation = $state("");

  // ── Undo / Redo ──────────────────────────────────────────────────────────────
  type Snapshot = {
    concepts: Record<string, ConceptMeta>;
    structure: Record<string, V4StructureNode>;
    modifiedIds: Set<string>;
    annotations: Record<string, string>;
  };

  const MAX_HISTORY = 50;
  let undoStack = $state<Snapshot[]>([]);
  let redoStack = $state<Snapshot[]>([]);

  function snapshot(): Snapshot {
    return {
      concepts: JSON.parse(JSON.stringify(concepts)),
      structure: JSON.parse(JSON.stringify(structure)),
      modifiedIds: new Set(modifiedIds),
      annotations: { ...annotations },
    };
  }

  function pushHistory() {
    undoStack = [...undoStack.slice(-(MAX_HISTORY - 1)), snapshot()];
    redoStack = [];
  }

  function undo() {
    if (undoStack.length === 0) return;
    redoStack = [...redoStack, snapshot()];
    const prev = undoStack[undoStack.length - 1];
    undoStack = undoStack.slice(0, -1);
    concepts = prev.concepts;
    structure = prev.structure;
    modifiedIds = prev.modifiedIds;
    annotations = prev.annotations;
  }

  function redo() {
    if (redoStack.length === 0) return;
    undoStack = [...undoStack, snapshot()];
    const next = redoStack[redoStack.length - 1];
    redoStack = redoStack.slice(0, -1);
    concepts = next.concepts;
    structure = next.structure;
    modifiedIds = next.modifiedIds;
    annotations = next.annotations;
  }

  function handleWindowKeydown(e: KeyboardEvent) {
    const meta = e.metaKey || e.ctrlKey;
    if (!meta) return;
    // Don't intercept while typing in an input/textarea
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if ((e.key === "z" && e.shiftKey) || e.key === "y") {
      e.preventDefault();
      redo();
    }
  }

  // ── Theme ────────────────────────────────────────────────────────────────────
  let theme = $state<"dark" | "light">("dark");

  $effect(() => {
    const stored =
      typeof localStorage !== "undefined"
        ? localStorage.getItem("ontedit-theme")
        : null;
    if (stored === "light" || stored === "dark") theme = stored;
  });

  $effect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.dataset.theme = theme;
      localStorage.setItem("ontedit-theme", theme);
    }
  });

  function toggleTheme() {
    theme = theme === "dark" ? "light" : "dark";
  }

  // ── Derived ─────────────────────────────────────────────────────────────────
  let selectedConcept = $derived(selectedId ? concepts[selectedId] : null);

  let totalConcepts = $derived(Object.keys(concepts).length);

  let searchResults = $derived(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const results: Array<{ id: string; meta: ConceptMeta }> = [];
    for (const [id, meta] of Object.entries(concepts)) {
      if (
        meta.name.toLowerCase().includes(q) ||
        meta.synonyms.some((s) => s.toLowerCase().includes(q))
      ) {
        results.push({ id, meta });
        if (results.length >= 200) break;
      }
    }
    return results;
  });

  let unsaved = $derived(
    selectedId !== null &&
      selectedConcept !== null &&
      (editName !== selectedConcept.name ||
        JSON.stringify(editSynonyms) !==
          JSON.stringify(selectedConcept.synonyms) ||
        JSON.stringify(editIcdCodes) !==
          JSON.stringify(selectedConcept.icd_codes) ||
        editPrimaryRef !== (selectedConcept.primary_reference ?? "") ||
        JSON.stringify(editRelated) !==
          JSON.stringify(selectedConcept.related_concepts) ||
        editAnnotation !== (annotations[selectedId!] ?? "")),
  );

  // ── Watch selection ──────────────────────────────────────────────────────────
  $effect(() => {
    if (!selectedConcept) return;
    editName = selectedConcept.name;
    editSynonyms = [...selectedConcept.synonyms];
    editIcdCodes = selectedConcept.icd_codes.map((c) =>
      Array.isArray(c) ? ([...c] as [string, string]) : c,
    );
    editPrimaryRef = selectedConcept.primary_reference ?? "";
    editRelated = [...selectedConcept.related_concepts];
    editAnnotation = annotations[selectedId!] ?? "";
    newSynonym = "";
    newRelated = "";
    newIcdString = "";
    newIcdTupleValue = "";
  });

  // ── Functions ────────────────────────────────────────────────────────────────
  function select(id: string) {
    selectedId = id;
  }

  function toggleExpand(id: string) {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    expanded = next;
  }

  function saveChanges() {
    if (!selectedId) return;
    pushHistory();
    concepts = {
      ...concepts,
      [selectedId]: {
        ...concepts[selectedId],
        name: editName.trim(),
        synonyms: editSynonyms,
        icd_codes: editIcdCodes,
        primary_reference: editPrimaryRef.trim() || null,
        related_concepts: editRelated,
      },
    };
    const trimmed = editAnnotation.trim();
    if (trimmed) {
      annotations = { ...annotations, [selectedId]: trimmed };
    } else {
      const { [selectedId]: _, ...rest } = annotations;
      annotations = rest;
    }
    modifiedIds = new Set([...modifiedIds, selectedId]);
  }

  function discardChanges() {
    if (!selectedConcept) return;
    editName = selectedConcept.name;
    editSynonyms = [...selectedConcept.synonyms];
    editIcdCodes = selectedConcept.icd_codes.map((c) =>
      Array.isArray(c) ? ([...c] as [string, string]) : c,
    );
    editPrimaryRef = selectedConcept.primary_reference ?? "";
    editRelated = [...selectedConcept.related_concepts];
    editAnnotation = annotations[selectedId!] ?? "";
    newSynonym = "";
    newRelated = "";
    newIcdString = "";
    newIcdTupleValue = "";
  }

  function addSynonym() {
    const v = newSynonym.trim();
    if (!v || editSynonyms.includes(v)) return;
    editSynonyms = [...editSynonyms, v];
    newSynonym = "";
  }

  function removeSynonym(i: number) {
    editSynonyms = editSynonyms.filter((_, idx) => idx !== i);
  }

  function addRelated() {
    const v = newRelated.trim();
    if (!v || editRelated.includes(v)) return;
    editRelated = [...editRelated, v];
    newRelated = "";
  }

  function removeRelated(i: number) {
    editRelated = editRelated.filter((_, idx) => idx !== i);
  }

  function addIcdCode() {
    if (newIcdFormat === "string") {
      const v = newIcdString.trim();
      if (!v) return;
      editIcdCodes = [...editIcdCodes, v];
      newIcdString = "";
    } else {
      const v = newIcdTupleValue.trim();
      const t = newIcdTupleType.trim();
      if (!v || !t) return;
      editIcdCodes = [...editIcdCodes, [t, v] as [string, string]];
      newIcdTupleValue = "";
    }
  }

  function removeIcdCode(i: number) {
    editIcdCodes = editIcdCodes.filter((_, idx) => idx !== i);
  }

  function handleIcdStringKey(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      addIcdCode();
    }
  }

  function handleIcdTupleKey(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      addIcdCode();
    }
  }

  function exportOntology() {
    if (!rawOntology) return;
    const updated = {
      ...rawOntology,
      metadata: {
        ...rawOntology.metadata,
        notes: `Edited in OntEdit. Original source: ${(rawOntology.metadata?.source as string) ?? "unknown"}`,
        editedAt: new Date().toISOString(),
        modifiedConcepts: modifiedIds.size,
      },
      concepts,
      structure,
      ...(Object.keys(annotations).length > 0 ? { annotations } : {}),
    };
    const blob = new Blob([JSON.stringify(updated, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ontology.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function formatIcdCode(code: string | [string, string]): string {
    if (Array.isArray(code)) return `[${code[0]}] ${code[1]}`;
    return code;
  }

  function handleSearchKey(e: KeyboardEvent) {
    if (e.key === "Escape") searchQuery = "";
  }

  function handleSynonymKey(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      addSynonym();
    }
  }

  function handleRelatedKey(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      addRelated();
    }
  }

  // ── File upload ──────────────────────────────────────────────────────────────

  function loadOntologyData(o: V4OntologyFile) {
    rawOntology = o;
    concepts = { ...o.concepts };
    structure = JSON.parse(JSON.stringify(o.structure));
    annotations = { ...(o.annotations ?? {}) };
    selectedId = null;
    expanded = new Set();
    modifiedIds = new Set();
    undoStack = [];
    redoStack = [];
  }

  function handleFileUpload(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string) as V4OntologyFile;
        loadOntologyData(parsed);
      } catch (err) {
        console.error("Failed to parse uploaded file:", err);
      }
    };
    reader.readAsText(file);
    // Reset input so the same file can be re-uploaded if needed
    (e.target as HTMLInputElement).value = "";
  }

  // ── Structure helpers ───────────────────────────────────────────────────────

  function mintId(): string {
    return `<MERGED-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}>`;
  }

  /** Walk the structure tree and find the parent node that contains `targetId` as a child. */
  function findParent(
    nodes: Record<string, V4StructureNode>,
    targetId: string,
    parentId: string | null = null,
  ): { parentNodes: Record<string, V4StructureNode>; parentId: string | null } | null {
    for (const [id, node] of Object.entries(nodes)) {
      const children = node.children;
      if (Array.isArray(children)) {
        if (children.includes(targetId)) {
          return { parentNodes: nodes, parentId: id };
        }
      } else {
        if (targetId in children) {
          return { parentNodes: children, parentId: id };
        }
        const found = findParent(children, targetId, id);
        if (found) return found;
      }
    }
    // Check if targetId is a root key
    if (parentId === null && targetId in nodes) {
      return { parentNodes: nodes, parentId: null };
    }
    return null;
  }

  function addConcept(parentId: string | null) {
    pushHistory();
    const newId = mintId();
    // Add to concepts
    concepts = {
      ...concepts,
      [newId]: {
        name: "New Concept",
        synonyms: [],
        icd_codes: [],
        primary_reference: null,
        related_concepts: [],
        source: "merged",
        createdBy: "user",
      },
    };

    if (parentId === null) {
      // Add as root node
      structure[newId] = { children: [] };
    } else {
      // Find the parent node in the structure
      const parentNode = findStructureNode(structure, parentId);
      if (parentNode) {
        if (Array.isArray(parentNode.children)) {
          // Leaf array — push new ID
          (parentNode.children as string[]).push(newId);
        } else {
          // Dict children — add new key
          (parentNode.children as Record<string, V4StructureNode>)[newId] = { children: [] };
        }
      }
      // Expand parent so new child is visible
      expanded = new Set([...expanded, parentId]);
    }

    modifiedIds = new Set([...modifiedIds, newId]);
    selectedId = newId;
  }

  /** Find a node by ID in the structure tree. */
  function findStructureNode(
    nodes: Record<string, V4StructureNode>,
    targetId: string,
  ): V4StructureNode | null {
    if (targetId in nodes) return nodes[targetId];
    for (const node of Object.values(nodes)) {
      if (!Array.isArray(node.children)) {
        const found = findStructureNode(node.children as Record<string, V4StructureNode>, targetId);
        if (found) return found;
      }
    }
    return null;
  }

  function deleteConcept(id: string) {
    if (!confirm(`Delete "${concepts[id]?.name ?? id}"? Children will be moved to the parent.`)) {
      return;
    }
    pushHistory();

    const deletedNode = findStructureNode(structure, id);

    // Check if it's a root-level node
    if (id in structure) {
      // Reparent children to root
      if (deletedNode) {
        if (Array.isArray(deletedNode.children)) {
          for (const childId of deletedNode.children as string[]) {
            structure[childId as string] = { children: [] };
          }
        } else {
          for (const [childId, childNode] of Object.entries(
            deletedNode.children as Record<string, V4StructureNode>,
          )) {
            structure[childId] = childNode;
          }
        }
      }
      delete structure[id];
    } else {
      // Find parent that contains this node
      const result = findParentOf(structure, id);
      if (result) {
        const { parentNode, key, index } = result;
        if (Array.isArray(parentNode.children)) {
          // Parent has leaf array children
          const arr = parentNode.children as string[];
          arr.splice(index!, 1);
          // Reparent: deleted node's children go into parent's leaf array
          if (deletedNode) {
            if (Array.isArray(deletedNode.children)) {
              arr.splice(index!, 0, ...(deletedNode.children as string[]));
            } else {
              // Deleted node had dict children — need to convert parent to dict
              const dictChildren = deletedNode.children as Record<string, V4StructureNode>;
              if (Object.keys(dictChildren).length > 0) {
                // Convert parent's array children to dict, inserting deleted node's children
                const newChildren: Record<string, V4StructureNode> = {};
                for (const leafId of arr) {
                  newChildren[leafId as string] = { children: [] };
                }
                for (const [childId, childNode] of Object.entries(dictChildren)) {
                  newChildren[childId] = childNode;
                }
                parentNode.children = newChildren;
              }
            }
          }
        } else {
          // Parent has dict children
          const dict = parentNode.children as Record<string, V4StructureNode>;
          // Reparent deleted node's children into parent dict
          if (deletedNode) {
            if (Array.isArray(deletedNode.children)) {
              for (const childId of deletedNode.children as string[]) {
                dict[childId as string] = { children: [] };
              }
            } else {
              for (const [childId, childNode] of Object.entries(
                deletedNode.children as Record<string, V4StructureNode>,
              )) {
                dict[childId] = childNode;
              }
            }
          }
          delete dict[id];
        }
      }
    }

    // Remove from concepts
    const { [id]: _, ...rest } = concepts;
    concepts = rest;

    // Clear selection
    if (selectedId === id) selectedId = null;

    // Clean up tracking
    const nextModified = new Set(modifiedIds);
    nextModified.delete(id);
    modifiedIds = nextModified;

    // Trigger reactivity on structure
    structure = { ...structure };
  }

  /** Find the parent node and position of a child in the tree. */
  function findParentOf(
    nodes: Record<string, V4StructureNode>,
    targetId: string,
  ): { parentNode: V4StructureNode; key: string; index?: number } | null {
    for (const [id, node] of Object.entries(nodes)) {
      if (Array.isArray(node.children)) {
        const idx = (node.children as string[]).indexOf(targetId);
        if (idx !== -1) return { parentNode: node, key: id, index: idx };
      } else {
        if (targetId in (node.children as Record<string, V4StructureNode>)) {
          return { parentNode: node, key: id };
        }
        const found = findParentOf(node.children as Record<string, V4StructureNode>, targetId);
        if (found) return found;
      }
    }
    return null;
  }

  // ── Tree snippet (recursive) ─────────────────────────────────────────────────
</script>

<!-- ── Snippets ─────────────────────────────────────────────────────────────── -->
{#snippet renderTree(nodes: Record<string, V4StructureNode>, depth: number)}
  {#each Object.entries(nodes) as [id, node]}
    {@const meta = concepts[id]}
    {@const name = meta?.name ?? id}
    {@const isLeafArray = Array.isArray(node.children)}
    {@const childCount = isLeafArray
      ? (node.children as string[]).length
      : Object.keys(node.children as Record<string, V4StructureNode>).length}
    {@const hasChildren = childCount > 0}
    {@const isExpanded = expanded.has(id)}
    {@const isSelected = selectedId === id}

    <div
      class="tree-node"
      class:selected={isSelected}
      class:modified={modifiedIds.has(id)}
      style:padding-left="{depth * 14 + 8}px"
      onclick={() => select(id)}
      role="button"
      tabindex="0"
      onkeydown={(e) => e.key === "Enter" && select(id)}
    >
      {#if hasChildren}
        <button
          class="expand-btn"
          onclick={(e) => {
            e.stopPropagation();
            toggleExpand(id);
          }}
          tabindex="-1"
        >
          {isExpanded ? "▾" : "▸"}
        </button>
      {:else}
        <span class="expand-spacer"></span>
      {/if}
      <span class="node-name">{name}</span>
      {#if childCount > 0}
        <span class="child-count">{childCount}</span>
      {/if}
    </div>

    {#if isExpanded && hasChildren}
      {#if isLeafArray}
        {#each node.children as string[] as childId}
          {@const childMeta = concepts[childId]}
          {@const childName = childMeta?.name ?? (childId as string)}
          <div
            class="tree-node leaf"
            class:selected={selectedId === (childId as string)}
            class:modified={modifiedIds.has(childId as string)}
            style:padding-left="{(depth + 1) * 14 + 8}px"
            onclick={() => select(childId as string)}
            role="button"
            tabindex="0"
            onkeydown={(e) => e.key === "Enter" && select(childId as string)}
          >
            <span class="expand-spacer"></span>
            <span class="node-name">{childName}</span>
          </div>
        {/each}
      {:else}
        {@render renderTree(
          node.children as Record<string, V4StructureNode>,
          depth + 1,
        )}
      {/if}
    {/if}
  {/each}
{/snippet}

<!-- ── Layout ──────────────────────────────────────────────────────────────── -->
<svelte:window onkeydown={handleWindowKeydown} />
<div class="app">
  <!-- Navbar -->
  <header class="navbar">
    <div class="navbar-left">
      <span class="logo">OntEdit</span>
      <span class="subtitle">Ontology Metadata Editor</span>
    </div>
    <div class="navbar-center">
      <span class="stat total">{totalConcepts} concepts</span>
      {#if modifiedIds.size > 0}
        <span class="stat modified-badge">{modifiedIds.size} edited</span>
      {/if}
    </div>
    <div class="navbar-right">
      <button
        class="undo-btn"
        onclick={undo}
        disabled={undoStack.length === 0}
        title="Undo (Cmd+Z)"
      >↩ Undo</button>
      <button
        class="undo-btn"
        onclick={redo}
        disabled={redoStack.length === 0}
        title="Redo (Cmd+Shift+Z)"
      >↪ Redo</button>
      <button
        class="theme-btn"
        onclick={toggleTheme}
        title="Toggle light/dark mode"
      >
        {theme === "dark" ? "☀" : "☾"}
      </button>
      <label class="upload-btn" title="Upload ontology.json">
        ↑ Upload JSON
        <input
          type="file"
          accept=".json"
          style="display:none"
          onchange={handleFileUpload}
        />
      </label>
      <button class="export-btn" onclick={exportOntology} disabled={!rawOntology}>
        ↓ Export JSON
      </button>
    </div>
  </header>

  <!-- No-data overlay -->
  {#if !rawOntology}
    <div class="no-data-overlay">
      <div class="no-data-card">
        <div class="no-data-title">No ontology loaded</div>
        <div class="no-data-body">
          Upload an <code>ontology.json</code> file exported from OntMerge to begin editing.
        </div>
        <label class="no-data-upload-btn">
          Upload ontology.json
          <input
            type="file"
            accept=".json"
            style="display:none"
            onchange={handleFileUpload}
          />
        </label>
      </div>
    </div>
  {/if}

  <!-- Main panels -->
  <div class="panels">
    <!-- Left: Tree browser -->
    <aside class="tree-panel">
      <div class="panel-head">
        <div class="panel-head-row">
          <input
            class="search-input"
            type="text"
            placeholder="Search concepts…"
            bind:value={searchQuery}
            onkeydown={handleSearchKey}
          />
          <button
            class="add-root-btn"
            onclick={() => addConcept(null)}
            title="Add root concept"
          >+</button>
        </div>
      </div>

      <div class="tree-scroll">
        {#if searchQuery.trim()}
          <!-- Flat search results -->
          {#if searchResults().length === 0}
            <div class="empty-msg">No results for "{searchQuery}"</div>
          {:else}
            {#each searchResults() as item}
              <div
                class="tree-node search-result"
                class:selected={selectedId === item.id}
                class:modified={modifiedIds.has(item.id)}
                onclick={() => select(item.id)}
                role="button"
                tabindex="0"
                onkeydown={(e) => e.key === "Enter" && select(item.id)}
              >
                <span class="expand-spacer"></span>
                <span class="node-name">{item.meta.name}</span>
                <span class="result-id">{item.id}</span>
              </div>
            {/each}
            {#if searchResults().length === 200}
              <div class="empty-msg">Showing first 200 results</div>
            {/if}
          {/if}
        {:else}
          <!-- Hierarchical tree -->
          {@render renderTree(structure, 0)}
        {/if}
      </div>
    </aside>

    <!-- Right: Metadata editor -->
    <main class="editor-panel">
      {#if selectedConcept}
        <div class="editor">
          <!-- Header -->
          <div class="editor-header">
            <div class="concept-id-row">
              <code class="concept-id">{selectedId}</code>
              {#if modifiedIds.has(selectedId ?? "")}
                <span class="edited-badge">edited</span>
              {/if}
            </div>
            <div class="editor-actions-row">
              <button
                class="action-btn"
                onclick={() => addConcept(selectedId)}
                title="Add child concept"
              >+ Add Child</button>
              <button
                class="action-btn destructive"
                onclick={() => selectedId && deleteConcept(selectedId)}
                title="Delete this concept"
              >Delete</button>
            </div>
          </div>

          <!-- Name -->
          <div class="field">
            <label class="field-label">Name</label>
            <input class="field-input full" type="text" bind:value={editName} />
          </div>

          <!-- Synonyms -->
          <div class="field">
            <label class="field-label"
              >Synonyms <span class="count">({editSynonyms.length})</span
              ></label
            >
            {#if editSynonyms.length > 0}
              <div class="tags">
                {#each editSynonyms as syn, i}
                  <span class="tag">
                    {syn}
                    <button class="tag-remove" onclick={() => removeSynonym(i)}
                      >×</button
                    >
                  </span>
                {/each}
              </div>
            {/if}
            <div class="add-row">
              <input
                class="field-input grow"
                type="text"
                placeholder="Add synonym…"
                bind:value={newSynonym}
                onkeydown={handleSynonymKey}
              />
              <button class="add-btn" onclick={addSynonym}>Add</button>
            </div>
          </div>

          <!-- ICD Codes -->
          <div class="field">
            <label class="field-label"
              >ICD Codes <span class="count">({editIcdCodes.length})</span
              ></label
            >
            {#if editIcdCodes.length > 0}
              <div class="icd-list">
                {#each editIcdCodes as code, i}
                  <div class="icd-item">
                    <span class="icd-text">{formatIcdCode(code)}</span>
                    {#if Array.isArray(code)}
                      <span class="icd-type-badge">{code[0]}</span>
                    {:else}
                      <span class="icd-type-badge str">str</span>
                    {/if}
                    <button
                      class="tag-remove icd-remove"
                      onclick={() => removeIcdCode(i)}>×</button
                    >
                  </div>
                {/each}
              </div>
            {:else}
              <span class="empty-field">None</span>
            {/if}

            <!-- Format toggle -->
            <div class="icd-format-row">
              <button
                class="fmt-btn"
                class:active={newIcdFormat === "string"}
                onclick={() => (newIcdFormat = "string")}>Plain string</button
              >
              <button
                class="fmt-btn"
                class:active={newIcdFormat === "tuple"}
                onclick={() => (newIcdFormat = "tuple")}>Type + code</button
              >
            </div>

            {#if newIcdFormat === "string"}
              <div class="add-row">
                <input
                  class="field-input grow"
                  type="text"
                  placeholder="e.g. ICD10: C71.9"
                  bind:value={newIcdString}
                  onkeydown={handleIcdStringKey}
                />
                <button class="add-btn" onclick={addIcdCode}>Add</button>
              </div>
            {:else}
              <div class="add-row">
                <select class="icd-type-select" bind:value={newIcdTupleType}>
                  <option value="icdO">icdO</option>
                  <option value="icd11">icd11</option>
                  <option value="icd10">icd10</option>
                  <option value="icd9">icd9</option>
                </select>
                <input
                  class="field-input grow"
                  type="text"
                  placeholder="e.g. 9400/3"
                  bind:value={newIcdTupleValue}
                  onkeydown={handleIcdTupleKey}
                />
                <button class="add-btn" onclick={addIcdCode}>Add</button>
              </div>
            {/if}
          </div>

          <!-- Primary Reference -->
          <div class="field">
            <label class="field-label">Primary Reference</label>
            <input
              class="field-input full"
              type="text"
              placeholder="URL or citation…"
              bind:value={editPrimaryRef}
            />
            {#if editPrimaryRef && editPrimaryRef.startsWith("http")}
              <a
                class="ref-link"
                href={editPrimaryRef}
                target="_blank"
                rel="noopener"
              >
                ↗ Open link
              </a>
            {/if}
          </div>

          <!-- Related Concepts -->
          <div class="field">
            <label class="field-label"
              >Related Concepts <span class="count">({editRelated.length})</span
              ></label
            >
            {#if editRelated.length > 0}
              <div class="tags">
                {#each editRelated as rel, i}
                  <span class="tag">
                    {rel}
                    <button class="tag-remove" onclick={() => removeRelated(i)}
                      >×</button
                    >
                  </span>
                {/each}
              </div>
            {/if}
            <div class="add-row">
              <input
                class="field-input grow"
                type="text"
                placeholder="Add related concept…"
                bind:value={newRelated}
                onkeydown={handleRelatedKey}
              />
              <button class="add-btn" onclick={addRelated}>Add</button>
            </div>
          </div>

          <!-- Merged from (read-only, if present) -->
          {#if selectedConcept.mergedFrom && selectedConcept.mergedFrom.length > 0}
            <div class="field">
              <label class="field-label">Merged From</label>
              <div class="code-list">
                {#each selectedConcept.mergedFrom as fromId}
                  <span class="code-item"
                    >{concepts[fromId]?.name ?? fromId}
                    <code class="small-id">{fromId}</code></span
                  >
                {/each}
              </div>
            </div>
          {/if}

          <!-- Annotation -->
          <div class="field">
            <label class="field-label">Annotation</label>
            <textarea
              class="field-textarea"
              placeholder="Add a note or annotation for this concept…"
              bind:value={editAnnotation}
            ></textarea>
          </div>

          <!-- Actions -->
          {#if unsaved}
            <div class="actions">
              <button class="save-btn" onclick={saveChanges}
                >✓ Save Changes</button
              >
              <button class="discard-btn" onclick={discardChanges}
                >Discard</button
              >
            </div>
          {:else}
            <div class="actions">
              <span class="saved-msg">All changes saved</span>
            </div>
          {/if}
        </div>
      {:else}
        <div class="no-selection">
          <div class="no-selection-icon">⬡</div>
          <p>Select a concept from the tree to view and edit its metadata.</p>
          <p class="no-selection-hint">
            Use the search bar to find concepts by name or synonym.
          </p>
        </div>
      {/if}
    </main>
  </div>
</div>

<style>
  /* ── App shell ─────────────────────────────────────────────────────────────── */
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
    position: relative;
  }

  /* ── Navbar ────────────────────────────────────────────────────────────────── */
  .navbar {
    display: flex;
    align-items: center;
    gap: 20px;
    height: 56px;
    padding: 0 20px;
    background: color-mix(in srgb, var(--bg-surface) 95%, transparent);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .navbar-left {
    display: flex;
    align-items: baseline;
    gap: 10px;
  }

  .logo {
    font-size: 16px;
    font-weight: 600;
    color: var(--logo);
    letter-spacing: -0.3px;
  }

  .subtitle {
    font-size: 12px;
    color: var(--text-faint);
  }

  .navbar-center {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
  }

  .stat {
    font-size: 12px;
    padding: 3px 10px;
    border-radius: 9999px;
    background: var(--bg-field);
    color: var(--text-dim);
    border: 1px solid var(--border);
  }

  .stat.total {
    color: var(--text-base);
  }

  .stat.modified-badge {
    color: var(--modified-fg);
    border-color: var(--modified-border);
    background: var(--modified-bg);
  }

  .navbar-right {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .theme-btn {
    background: var(--bg-field);
    color: var(--text-dim);
    border: 1px solid var(--border-control);
    padding: 6px 10px;
    font-size: 15px;
    line-height: 1;
    border-radius: 8px;
  }

  .theme-btn:hover {
    background: var(--bg-hover);
    color: var(--text-base);
  }

  .undo-btn {
    background: var(--bg-field);
    color: var(--text-base);
    padding: 6px 10px;
    border: 1px solid var(--border-control);
    font-size: 13px;
  }

  .undo-btn:hover:not(:disabled) {
    background: var(--bg-hover);
  }

  .undo-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .export-btn {
    background: var(--bg-field);
    color: var(--text-base);
    padding: 6px 14px;
    border: 1px solid var(--border-control);
    font-size: 13px;
    font-weight: 500;
  }

  .export-btn:hover:not(:disabled) {
    background: var(--bg-hover);
  }

  .export-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .upload-btn {
    display: inline-flex;
    align-items: center;
    background: var(--bg-field);
    color: var(--text-base);
    padding: 6px 14px;
    border: 1px solid var(--border-control);
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;
  }

  .upload-btn:hover {
    background: var(--bg-hover);
  }

  /* ── No-data overlay ────────────────────────────────────────────────────────── */
  .no-data-overlay {
    position: absolute;
    inset: 0;
    top: 48px; /* below navbar */
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-app);
    z-index: 10;
  }

  .no-data-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: 40px 48px;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    max-width: 400px;
    text-align: center;
  }

  .no-data-title {
    font-size: 18px;
    font-weight: 600;
    color: var(--text-base);
  }

  .no-data-body {
    font-size: 14px;
    color: var(--text-muted);
    line-height: 1.6;
  }

  .no-data-body code {
    font-family: ui-monospace, monospace;
    background: var(--bg-field);
    padding: 1px 5px;
    border-radius: 4px;
    color: var(--accent);
  }

  .no-data-upload-btn {
    display: inline-flex;
    align-items: center;
    padding: 10px 24px;
    background: var(--accent);
    color: #fff;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .no-data-upload-btn:hover {
    opacity: 0.85;
  }

  /* ── Panels ─────────────────────────────────────────────────────────────────── */
  .panels {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  /* ── Tree panel ─────────────────────────────────────────────────────────────── */
  .tree-panel {
    width: 340px;
    min-width: 240px;
    max-width: 480px;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--border);
    background: var(--bg-panel);
    flex-shrink: 0;
  }

  .panel-head {
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
  }

  .panel-head-row {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .search-input {
    flex: 1;
    min-width: 0;
  }

  .add-root-btn {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    background: var(--bg-field);
    border: 1px solid var(--border-control);
    color: var(--text-muted);
    font-size: 18px;
    font-weight: 400;
    line-height: 1;
    border-radius: 6px;
    padding: 0;
  }

  .add-root-btn:hover {
    background: var(--bg-hover);
    color: var(--text-base);
  }

  .tree-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
  }

  /* ── Tree nodes ─────────────────────────────────────────────────────────────── */
  .tree-node {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px 4px 10px;
    cursor: pointer;
    border-radius: 6px;
    margin: 1px 4px;
    min-height: 28px;
    user-select: none;
    position: relative;
  }

  .tree-node:hover {
    background: var(--bg-hover);
  }

  .tree-node.selected {
    background: var(--bg-selected);
    border-left: 2px solid var(--border-accent);
    padding-left: calc(var(--left, 10px) - 2px);
  }

  .tree-node.modified::after {
    content: "•";
    position: absolute;
    right: 6px;
    color: var(--modified-fg);
    font-size: 16px;
    line-height: 1;
  }

  .expand-btn {
    background: none;
    padding: 0;
    width: 14px;
    height: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-faint);
    font-size: 10px;
    flex-shrink: 0;
  }

  .expand-btn:hover {
    color: var(--text-muted);
    opacity: 1;
  }

  .expand-spacer {
    width: 14px;
    flex-shrink: 0;
  }

  .node-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-secondary);
    font-size: 13px;
  }

  .tree-node.leaf .node-name {
    color: var(--text-muted);
  }

  .child-count {
    font-size: 11px;
    color: var(--text-dimmer);
    flex-shrink: 0;
  }

  .result-id {
    font-size: 10px;
    color: var(--text-faintest);
    font-family: monospace;
    flex-shrink: 0;
    max-width: 100px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .empty-msg {
    padding: 12px 16px;
    color: var(--text-faint);
    font-size: 12px;
  }

  /* ── Editor panel ────────────────────────────────────────────────────────────── */
  .editor-panel {
    flex: 1;
    overflow-y: auto;
    background: var(--bg-app);
  }

  .editor {
    max-width: 700px;
    padding: 24px 32px;
  }

  /* Header */
  .editor-header {
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border);
  }

  .concept-id-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .editor-actions-row {
    display: flex;
    gap: 6px;
    margin-top: 10px;
  }

  .action-btn {
    background: var(--bg-field);
    color: var(--text-muted);
    border: 1px solid var(--border-control);
    padding: 5px 12px;
    font-size: 12px;
    font-weight: 500;
    border-radius: 6px;
  }

  .action-btn:hover {
    background: var(--bg-hover);
    color: var(--text-base);
  }

  .action-btn.destructive {
    color: var(--tag-remove-hover);
  }

  .action-btn.destructive:hover {
    background: #451a1a;
    color: #f87171;
    border-color: #7f1d1d;
  }

  .concept-id {
    font-size: 11px;
    color: var(--text-dimmer);
    background: var(--bg-field);
    padding: 3px 8px;
    border-radius: 6px;
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  }

  .edited-badge {
    font-size: 10px;
    color: var(--modified-fg);
    background: var(--modified-bg);
    border: 1px solid var(--modified-border);
    padding: 2px 8px;
    border-radius: 9999px;
  }

  /* Fields */
  .field {
    margin-bottom: 20px;
  }

  .field-label {
    display: block;
    font-size: 12px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-dim);
    margin-bottom: 8px;
  }

  .count {
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
    color: var(--text-dimmer);
  }

  .field-input {
    display: block;
  }

  .field-input.full {
    width: 100%;
  }

  .field-input.grow {
    flex: 1;
  }

  .field-textarea {
    width: 100%;
    min-height: 80px;
    resize: vertical;
    font-family: inherit;
    font-size: 13px;
    line-height: 1.5;
    box-sizing: border-box;
  }

  /* Tags */
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 10px;
  }

  .tag {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: var(--bg-tag);
    border: 1px solid var(--border-control);
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 13px;
    color: var(--text-secondary);
  }

  .tag-remove {
    background: none;
    padding: 0 2px;
    color: var(--text-faint);
    font-size: 14px;
    line-height: 1;
  }

  .tag-remove:hover {
    color: var(--tag-remove-hover);
    opacity: 1;
  }

  /* Add row */
  .add-row {
    display: flex;
    gap: 6px;
  }

  .add-btn {
    background: var(--bg-hover-deep);
    color: var(--text-muted);
    border: 1px solid var(--border-control);
    padding: 6px 12px;
    flex-shrink: 0;
    font-weight: 500;
  }

  .add-btn:hover {
    background: var(--bg-hover);
  }

  /* ICD codes */
  .icd-list {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin-bottom: 8px;
  }

  .icd-item {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--bg-field);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 6px 10px;
  }

  .icd-text {
    font-size: 13px;
    color: var(--text-muted);
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .icd-type-badge {
    font-size: 10px;
    font-weight: 600;
    color: var(--icd-type-fg);
    background: var(--icd-type-bg);
    border-radius: 4px;
    padding: 2px 6px;
    flex-shrink: 0;
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
    text-transform: uppercase;
  }

  .icd-type-badge.str {
    color: var(--icd-str-fg);
    background: var(--icd-str-bg);
  }

  .icd-remove {
    flex-shrink: 0;
  }

  .icd-format-row {
    display: flex;
    gap: 4px;
    margin-bottom: 6px;
    margin-top: 4px;
  }

  .fmt-btn {
    background: var(--bg-field);
    color: var(--text-dim);
    border: 1px solid var(--border-control);
    padding: 4px 12px;
    font-size: 12px;
    border-radius: 6px;
  }

  .fmt-btn.active {
    background: var(--btn-fmt-active-bg);
    color: var(--btn-fmt-active-fg);
    border-color: var(--btn-fmt-active-border);
  }

  .fmt-btn:hover {
    background: var(--bg-hover);
  }

  .fmt-btn.active:hover {
    background: var(--btn-fmt-active-bg-hover);
  }

  .icd-type-select {
    font-family: inherit;
    font-size: 13px;
    background: var(--bg-field);
    border: 1px solid var(--border-control);
    border-radius: 6px;
    color: var(--text-base);
    padding: 6px 8px;
    flex-shrink: 0;
    cursor: pointer;
    outline: none;
  }

  .icd-type-select:focus {
    border-color: var(--border-accent);
    box-shadow: 0 0 0 2px rgba(129, 140, 248, 0.15);
  }

  .small-id {
    font-size: 10px;
    color: var(--text-faintest);
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  }

  .empty-field {
    color: var(--text-faintest);
    font-size: 12px;
    font-style: italic;
  }

  /* Ref link */
  .ref-link {
    display: inline-block;
    margin-top: 4px;
    font-size: 11px;
    color: var(--accent);
    text-decoration: none;
  }

  .ref-link:hover {
    text-decoration: underline;
  }

  /* Actions */
  .actions {
    margin-top: 28px;
    padding-top: 18px;
    border-top: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .save-btn {
    background: var(--btn-save-bg);
    color: var(--btn-save-fg);
    border: 1px solid var(--btn-save-border);
    padding: 8px 20px;
    font-weight: 600;
    border-radius: 8px;
    box-shadow: var(--shadow-sm);
  }

  .save-btn:hover {
    background: var(--btn-save-bg-hover);
  }

  .discard-btn {
    background: var(--bg-field);
    color: var(--text-dim);
    border: 1px solid var(--border-control);
    padding: 8px 20px;
    border-radius: 8px;
  }

  .discard-btn:hover {
    background: var(--bg-hover);
  }

  .saved-msg {
    color: var(--text-faintest);
    font-size: 12px;
  }

  /* No selection */
  .no-selection {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 12px;
    color: var(--text-dimmer);
    padding: 40px;
    text-align: center;
  }

  .no-selection-icon {
    font-size: 48px;
    line-height: 1;
    color: var(--no-select-icon);
    opacity: 0.6;
  }

  .no-selection p {
    font-size: 14px;
    max-width: 280px;
  }

  .no-selection-hint {
    font-size: 13px;
    color: var(--text-faintest);
  }
</style>
