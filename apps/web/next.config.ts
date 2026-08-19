import path from "node:path";
import type { NextConfig } from "next";
import { loadLocalDatabaseEnvironment } from "./env-loader";

loadLocalDatabaseEnvironment();

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
};

export default nextConfig;
