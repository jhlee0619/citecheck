import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@citecheck/core": fileURLToPath(new URL("./apps/mcp/src/lib/core/index.ts", import.meta.url)),
      "@citecheck/connectors": fileURLToPath(new URL("./apps/mcp/src/lib/connectors/index.ts", import.meta.url)),
      "@citecheck/runtime": fileURLToPath(new URL("./apps/mcp/src/lib/runtime/index.ts", import.meta.url)),
      "@citecheck/policy": fileURLToPath(new URL("./apps/mcp/src/lib/policy/index.ts", import.meta.url))
    }
  },
  test: {
    environment: "node",
    include: ["apps/**/*.test.ts", "eval/**/*.test.ts"]
  }
});
