import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig } from 'vite';
// Native Node runtime: PostgreSQL and local files live in the same monolith.
// The original UI framework and routes remain intact.
export default defineConfig({
  css:{postcss:{plugins:[tailwindcss()]}},plugins:[vinext()],
  server:{host:'127.0.0.1'},
});
