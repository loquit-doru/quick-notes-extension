import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * The site is a single page; #features, #screenshots and #privacy are anchors on
 * it, not separate URLs, so listing them would just repeat the same address.
 *
 * lastModified is evaluated at build time, which means it advances on every
 * deploy — an honest signal, since a deploy is when the content actually changes.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
