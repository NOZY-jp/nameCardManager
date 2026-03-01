import type { NextConfig } from "next";
import { join } from "node:path";

const stylesDir = join(process.cwd(), "src/styles");

const nextConfig: NextConfig = {
  sassOptions: {
    includePaths: [stylesDir],
    additionalData: `@use "${stylesDir}/_variables.scss" as *;`,
  },
  output: "standalone",
};

export default nextConfig;
