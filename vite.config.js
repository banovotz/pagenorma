import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Mojih1500',
        short_name: 'Mojih1500',
        description: 'Aplikacija za književne prevoditelje',
        theme_color: '#008080',
        background_color: '#F8F5F2',
        display: 'standalone',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        // Automatski hvata sve bildane .html, .js, .css, .png datoteke
        globPatterns: ['**/*.{js,css,html,ico,png,svg}']
      }
    })
  ]
});