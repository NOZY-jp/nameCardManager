"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api/client";

interface AuthImageProps
  extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> {
  /** API path relative to base URL, e.g. "/images/123" */
  apiPath: string;
}

/**
 * Renders an <img> whose src is fetched via the authenticated API client.
 * Converts the response blob into an object URL so the browser can display it.
 */
export function AuthImage({ apiPath, alt, ...rest }: AuthImageProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    let revoke: string | null = null;

    apiClient
      .get(apiPath, { responseType: "blob" })
      .then((res) => {
        const url = URL.createObjectURL(res.data);
        revoke = url;
        setBlobUrl(url);
      })
      .catch(() => {
        setBlobUrl(null);
      });

    return () => {
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [apiPath]);

  if (!blobUrl) return null;

  // biome-ignore lint/a11y/useAltText: alt is passed via props spread
  return <img src={blobUrl} alt={alt} {...rest} />;
}
