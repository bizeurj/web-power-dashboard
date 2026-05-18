/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow importing the existing Node fetchers from the parent directory.
  // The fetchers use Node-only APIs (googleapis, GA4 SDK) so they only run
  // in API routes (server-side), never in the browser.
  experimental: {
    externalDir: true,
  },
};

module.exports = nextConfig;
