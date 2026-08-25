/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Server Actions are intentionally not used for anything credential-related — all
  // credential operations go through the same authenticated REST API the desktop app uses
  // (docs/architecture.md §5), so there is exactly one code path to secure and audit.
  transpilePackages: ["@tax-platform/api-client", "@tax-platform/types"],
};

module.exports = nextConfig;
