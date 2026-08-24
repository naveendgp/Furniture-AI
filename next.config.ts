import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  // transformers.js pulls in node-only deps — keep them out of the browser bundle.
  serverExternalPackages: ["@huggingface/transformers", "sharp", "onnxruntime-node"],
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "onnxruntime-node$": false,
      sharp$: false,
    };
    return config;
  },
};

export default nextConfig;
