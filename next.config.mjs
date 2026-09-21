/** @type {import('next').NextConfig} */
const desktop = process.env.DESKTOP_BUILD === "1";

const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  // Desktop (Electron) build: emit a fully static bundle into ./out
  ...(desktop
    ? { output: "export", images: { unoptimized: true }, trailingSlash: true }
    : {}),
};

export default nextConfig;
