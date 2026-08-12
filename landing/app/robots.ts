import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * Nothing here is private, so everything is crawlable. The point of the file is
 * the sitemap pointer: it is how a crawler that arrives without one finds it.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
