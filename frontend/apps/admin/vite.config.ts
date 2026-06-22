/// <reference types="vite-plus" />
import { defineConfig } from "vite-plus";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { resolve } from "node:path";

const host = process.env.HOST || "0.0.0.0";
const port = parseInt(process.env.PORT || "3003", 10);

export default defineConfig(({ mode }) => {
  const isProduction = mode === "production" || process.env.NODE_ENV === "production";

  return {
    plugins: [
      tanstackRouter({
        target: "react",
        autoCodeSplitting: true,
      }),
    ],
    resolve: {
      alias: {
        "@": resolve(__dirname, "./src"),
      },
    },
    server: {
      host,
      port,
    },
  };
});
