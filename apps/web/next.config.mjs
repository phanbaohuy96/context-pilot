/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@teams-observer/ai",
    "@teams-observer/core",
    "@teams-observer/db",
    "@teams-observer/graph",
  ],
  serverExternalPackages: ["@prisma/client"],
};

export default nextConfig;
