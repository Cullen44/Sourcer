import type { NextConfig } from "next";

const config: NextConfig = {
  // The jobs run with tsx; Next only serves the read-only viewer.
  serverExternalPackages: ["pg", "@prisma/adapter-pg"],
};

export default config;
