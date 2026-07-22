import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the native SQLite addon out of the server bundle.
  serverExternalPackages: ["better-sqlite3", "bindings"],
};

export default nextConfig;
