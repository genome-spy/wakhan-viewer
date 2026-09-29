import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.GITHUB_PAGES ? "/wakhan-explorer/" : "/",
  worker: { format: "es" },
  test: { environment: "node" },
});
