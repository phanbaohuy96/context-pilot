/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@context-pilot/ai",
    "@context-pilot/core",
    "@context-pilot/db",
    "@context-pilot/graph",
  ],
  serverExternalPackages: ["@prisma/client", "pdf-parse"],
  experimental: {
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
