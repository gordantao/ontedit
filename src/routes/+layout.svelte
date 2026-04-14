<script lang="ts">
  import favicon from "$lib/assets/favicon.svg";

  let { children } = $props();
</script>

<svelte:head>
  <title>OntEdit</title>
  <link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

<style>
  /* ── Theme tokens ──────────────────────────────────────────────────────────── */
  :global(:root),
  :global(html[data-theme="dark"]) {
    --bg-app: #1a1a1a;
    --bg-surface: #1a1a1a;
    --bg-panel: #232323;
    --bg-field: #2e2e2e;
    --bg-hover: #333333;
    --bg-hover-deep: #3a3a3a;
    --bg-selected: #2a2a3e;
    --bg-tag: #2e2e2e;
    --border: rgba(255, 255, 255, 0.1);
    --border-control: rgba(255, 255, 255, 0.15);
    --border-accent: #818cf8;
    --border-accent-muted: rgba(255, 255, 255, 0.15);
    --text-base: #fafafa;
    --text-secondary: #e5e5e5;
    --text-muted: #a3a3a3;
    --text-dim: #737373;
    --text-dimmer: #525252;
    --text-faint: #525252;
    --text-faintest: #404040;
    --accent: #818cf8;
    --logo: #c4b5fd;
    --pathout-fg: #f87171;
    --pathout-bg: #451a1a;
    --pathout-border: #7f1d1d;
    --pathout-dot: #ef4444;
    --who-fg: #60a5fa;
    --who-bg: #1e3a5f;
    --who-border: #1e3a5f;
    --who-dot: #3b82f6;
    --merged-fg: #c084fc;
    --merged-bg: #3b1764;
    --merged-border: #3b1764;
    --merged-dot: #a855f7;
    --modified-fg: #fbbf24;
    --modified-bg: #1e1307;
    --modified-border: #78350f;
    --dot-unknown: #525252;
    --icd-type-fg: #60a5fa;
    --icd-type-bg: #1e3a5f;
    --icd-str-fg: #a3a3a3;
    --icd-str-bg: #2e2e2e;
    --btn-save-bg: #2e2e2e;
    --btn-save-bg-hover: #3a3a3a;
    --btn-save-fg: #fafafa;
    --btn-save-border: rgba(255, 255, 255, 0.15);
    --btn-fmt-active-bg: #2a2a3e;
    --btn-fmt-active-bg-hover: #333348;
    --btn-fmt-active-fg: #818cf8;
    --btn-fmt-active-border: rgba(129, 140, 248, 0.3);
    --scrollbar-thumb: #404040;
    --no-select-icon: #333333;
    --tag-remove-hover: #ef4444;
    --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
    --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
  }

  :global(html[data-theme="light"]) {
    --bg-app: #ffffff;
    --bg-surface: #ffffff;
    --bg-panel: #f5f5f5;
    --bg-field: #f5f5f5;
    --bg-hover: #ebebeb;
    --bg-hover-deep: #e0e0e0;
    --bg-selected: #eef2ff;
    --bg-tag: #f5f5f5;
    --border: #e5e5e5;
    --border-control: #d4d4d4;
    --border-accent: #6366f1;
    --border-accent-muted: #c7d2fe;
    --text-base: #171717;
    --text-secondary: #262626;
    --text-muted: #525252;
    --text-dim: #737373;
    --text-dimmer: #737373;
    --text-faint: #a3a3a3;
    --text-faintest: #a3a3a3;
    --accent: #4f46e5;
    --logo: #4f46e5;
    --pathout-fg: #dc2626;
    --pathout-bg: #fee2e2;
    --pathout-border: #fecaca;
    --pathout-dot: #ef4444;
    --who-fg: #2563eb;
    --who-bg: #dbeafe;
    --who-border: #bfdbfe;
    --who-dot: #3b82f6;
    --merged-fg: #7c3aed;
    --merged-bg: #f3e8ff;
    --merged-border: #e9d5ff;
    --merged-dot: #a855f7;
    --modified-fg: #b45309;
    --modified-bg: #fefce8;
    --modified-border: #fde68a;
    --dot-unknown: #9ca3af;
    --icd-type-fg: #2563eb;
    --icd-type-bg: #dbeafe;
    --icd-str-fg: #737373;
    --icd-str-bg: #f5f5f5;
    --btn-save-bg: #171717;
    --btn-save-bg-hover: #262626;
    --btn-save-fg: #fafafa;
    --btn-save-border: #171717;
    --btn-fmt-active-bg: #eef2ff;
    --btn-fmt-active-bg-hover: #e0e7ff;
    --btn-fmt-active-fg: #4f46e5;
    --btn-fmt-active-border: #c7d2fe;
    --scrollbar-thumb: #d4d4d4;
    --no-select-icon: #e5e5e5;
    --tag-remove-hover: #ef4444;
    --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
    --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  }

  :global(*) {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  :global(body) {
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
      "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 14px;
    background: var(--bg-app);
    color: var(--text-base);
    height: 100vh;
    overflow: hidden;
    transition:
      background 0.2s,
      color 0.2s;
  }

  :global(input),
  :global(textarea) {
    font-family: inherit;
    font-size: 14px;
    background: var(--bg-field);
    border: 1px solid var(--border-control);
    border-radius: 6px;
    color: var(--text-base);
    padding: 6px 10px;
    outline: none;
    transition: border-color 0.15s;
  }

  :global(input:focus),
  :global(textarea:focus) {
    border-color: var(--border-accent);
    box-shadow: 0 0 0 2px rgba(129, 140, 248, 0.15);
  }

  :global(button) {
    font-family: inherit;
    font-size: 13px;
    cursor: pointer;
    border: none;
    border-radius: 6px;
    padding: 6px 12px;
    transition:
      background 0.15s,
      color 0.15s;
  }

  :global(button:hover) {
    opacity: 1;
  }

  :global(::-webkit-scrollbar) {
    width: 6px;
    height: 6px;
  }

  :global(::-webkit-scrollbar-track) {
    background: transparent;
  }

  :global(::-webkit-scrollbar-thumb) {
    background: var(--scrollbar-thumb);
    border-radius: 3px;
  }
</style>
