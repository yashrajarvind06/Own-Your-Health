import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,

    // ✅ Allow both localhost + ngrok
    allowedHosts: [
      "localhost",
      "127.0.0.1",
      "subsequently-nondefinitive-nella.ngrok-free.dev"
    ],

    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000", // backend local
        changeOrigin: true,
        secure: false,
      }
    }
  },
});
