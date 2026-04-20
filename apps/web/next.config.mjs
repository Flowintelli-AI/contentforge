/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prevent webpack from bundling native binaries — resolved at runtime from node_modules
  serverExternalPackages: ["ffmpeg-static"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.blob.core.windows.net" },
      { protocol: "https", hostname: "**.public.blob.vercel-storage.com" },
      { protocol: "https", hostname: "img.clerk.com" },
    ],
  },
  async headers() {
    return [
      {
        source: "/api/webhooks/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;
