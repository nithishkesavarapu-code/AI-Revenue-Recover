import nextEnv from "@next/env";
import { fileURLToPath } from "node:url";
import path from "node:path";

// The web workspace starts below the repository root, where local secrets live.
// Railway injects its variables first, so this only fills missing local values.
const configDirectory = path.dirname(fileURLToPath(import.meta.url));
const { loadEnvConfig } = nextEnv;
loadEnvConfig(path.resolve(configDirectory, "../.."));

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@revrec/shared"],
};

export default nextConfig;
