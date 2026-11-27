import { join } from "node:path";
import type { NextConfig } from "next";

const stylesDir = join(process.cwd(), "src/styles").replaceAll("\\", "/");

const nextConfig: NextConfig = {
  sassOptions: {
    loadPaths: [stylesDir],
    additionalData: '@use "variables" as *;',
  },
  output: "standalone",
};

export default nextConfig;
