import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const { VITE_API_URL: apiUrl } = loadEnv(mode, process.cwd(), "");
  if (mode === "production") {
    if (!apiUrl?.trim()) {
      throw new Error("VITE_API_URL must point to the deployed API and end in /api for production builds.");
    }

    let parsedApiUrl;
    try {
      parsedApiUrl = new URL(apiUrl);
    } catch {
      throw new Error("VITE_API_URL must be an absolute API URL ending in /api.");
    }
    if (!parsedApiUrl.pathname.replace(/\/+$/, "").endsWith("/api")) {
      throw new Error("VITE_API_URL must end in /api.");
    }
    if (process.env.VERCEL && parsedApiUrl.protocol !== "https:") {
      throw new Error("VITE_API_URL must use HTTPS for Vercel production builds.");
    }
  }

  return {
    plugins: [react()],
    server: { port: 5173 },
  };
});
