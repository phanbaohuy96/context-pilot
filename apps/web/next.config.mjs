/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@context-pilot/ai",
    "@context-pilot/core",
    "@context-pilot/db",
    "@context-pilot/graph",
  ],
  serverExternalPackages: ["@prisma/client"],
};

export default nextConfig;
