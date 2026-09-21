import type { NextConfig } from "next";

const config: NextConfig = {
  // The container runs the standalone server, not `next start`, so the image
  // carries only the traced dependencies rather than all of node_modules.
  output: "standalone",
  poweredByHeader: false,
};

export default config;
