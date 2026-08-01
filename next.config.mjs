/** @type {import('next').NextConfig} */
const nextConfig = {
  // `next dev` and `next build` may run side by side during local validation.
  // Separate their manifests/assets so a production build cannot corrupt HMR.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  output: "standalone",
  poweredByHeader: false,
};

export default nextConfig;
