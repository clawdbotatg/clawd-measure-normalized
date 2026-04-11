import type { NextConfig } from "next";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { BannerPlugin } = require("webpack");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  typescript: {
    ignoreBuildErrors: process.env.NEXT_PUBLIC_IGNORE_BUILD_ERROR === "true",
  },
  eslint: {
    ignoreDuringBuilds: process.env.NEXT_PUBLIC_IGNORE_BUILD_ERROR === "true",
  },
  webpack: (config, { isServer }) => {
    config.resolve.fallback = { fs: false, net: false, tls: false };
    config.externals.push("pino-pretty", "lokijs", "encoding");

    // Polyfill localStorage for SSG prerendering in Vercel build workers.
    // @vercel/next passes --localstorage-file without a valid path, creating
    // a broken localStorage object. This banner injects a fix into all server chunks.
    if (isServer) {
      config.plugins.push(
        new BannerPlugin({
          banner: `
if (typeof globalThis !== "undefined" && typeof globalThis.localStorage !== "undefined" && typeof globalThis.localStorage.getItem !== "function") {
  var _s = {};
  globalThis.localStorage = {
    getItem: function(k) { return _s[k] !== undefined ? _s[k] : null; },
    setItem: function(k, v) { _s[k] = String(v); },
    removeItem: function(k) { delete _s[k]; },
    clear: function() { Object.keys(_s).forEach(function(k) { delete _s[k]; }); },
    get length() { return Object.keys(_s).length; },
    key: function(i) { return Object.keys(_s)[i] || null; }
  };
}`,
          raw: true,
          entryOnly: false,
        }),
      );
    }

    return config;
  },
};

const isIpfs = process.env.NEXT_PUBLIC_IPFS_BUILD === "true";

if (isIpfs) {
  nextConfig.output = "export";
  nextConfig.trailingSlash = true;
  nextConfig.images = {
    unoptimized: true,
  };
}

module.exports = nextConfig;
