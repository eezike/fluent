import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@fluent/shared", "@fluent/ui"],
  async headers() {
    return [
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Service-Worker-Allowed", value: "/" }] },
    ];
  },
};

export default config;
