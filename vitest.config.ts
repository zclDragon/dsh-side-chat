import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Client specs opt into jsdom via the per-file `// @vitest-environment jsdom`
    // pragma; the shared default stays node.
    environment: 'node',
    // The client bundle pulls @deepseek-ai/dsh-client-ui-primitives (MarkdownText),
    // whose ESM ships CSS module imports Node cannot load. Stub all CSS so the
    // tests exercise components, not stylesheet loading.
    css: false,
  },
})
