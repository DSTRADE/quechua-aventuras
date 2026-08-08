import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
  integrations: [react()],
  // i18n routing handled manually via file structure
  // Pages at /es/ are Spanish, /en/ would be English, etc.
});
