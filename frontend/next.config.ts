import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export: this app is served as pre-built HTML/JS by the Python
  // (gr.Server / FastAPI) backend, not by a Next.js server — no SSR, no API
  // routes. All data comes from client-side calls to the backend's API.
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
