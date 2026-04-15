import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    setupFiles: ["./tests/setup.ts"],
    exclude: ["tests/e2e/**", "node_modules/**"],
    // Run test files sequentially (shared SQLite DB)
    fileParallelism: false,
    env: {
      NODE_ENV: "test",
    },
  },
});
