// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://mmcc.io',
  output: 'static',
  server: { host: true, allowedHosts: ['spaceghost'] },
});
