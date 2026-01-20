import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const blog = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    date: z.coerce.date(),
    draft: z.boolean().optional().default(false),
    tags: z.array(z.string()).optional().default([]),
    url: z.string().url().optional(),
    source: z.string().optional(),
  }),
});

export const collections = { blog };
