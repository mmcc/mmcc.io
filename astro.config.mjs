// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://mmcc.io',
  output: 'static',
  server: { host: true, allowedHosts: ['spaceghost'] },
  integrations: [sitemap()],
});
