import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        conditions: resolve(__dirname, 'conditions/index.html'),
        confidentialite: resolve(__dirname, 'confidentialite/index.html'),
        contact: resolve(__dirname, 'contact/index.html'),
        blog: resolve(__dirname, 'blog/index.html'),
        'blog-affiliation': resolve(__dirname, 'blog/affiliation/index.html'),
        'blog-niche': resolve(__dirname, 'blog/niche/index.html'),
        'blog-programmes': resolve(__dirname, 'blog/programmes/index.html'),
        'blog-tracking': resolve(__dirname, 'blog/tracking/index.html'),
        'blog-contenu': resolve(__dirname, 'blog/contenu/index.html'),
        'blog-seo': resolve(__dirname, 'blog/seo/index.html'),
        'mentions-legales': resolve(__dirname, 'mentions-legales/index.html'),
        merci: resolve(__dirname, 'merci/index.html'),
        paiement: resolve(__dirname, 'paiement/index.html'),
        'paiement-annule': resolve(__dirname, 'paiement/annule/index.html'),
        '404': resolve(__dirname, '404.html'),
      },
    },
  },
});
