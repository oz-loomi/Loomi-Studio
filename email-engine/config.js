import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const rooftops = require('./src/data/rooftops.json');

/** @type {import('@maizzle/framework').Config} */

export default {
  build: {
    content: ["src/templates/**/*.html"],
    output: {
      path: "build_local",
    },
    static: {
      source: ["src/images/**/*"],
      destination: "images",
    },
  },

  components: {
    root: ".",
    folders: [
      "src/components",
      "src/layouts",
    ],
  },

  css: {
    inline: true,
    purge: true,
  },
  prettify: true,

  yag: { rooftops },
};
