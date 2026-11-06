import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/ipfs-api": {
        target: "http://127.0.0.1:5002",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ipfs-api/, "/api/v0"),
      },
      "/ipfs": {
        target: "http://127.0.0.1:8082",
        changeOrigin: true,
      },
      "/ganache-rpc": {
        target: "http://127.0.0.1:7545",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ganache-rpc/, ""),
      },
    },
  },
});
