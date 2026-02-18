import path from 'path';

// Loomi Studio sits at: /path/to/loomi-studio/
// Email Engine:         /path/to/loomi-studio/email-engine/

const STUDIO_ROOT = process.cwd();
const ENGINE_ROOT = path.join(STUDIO_ROOT, 'email-engine');

export const PATHS = {
  studioRoot: STUDIO_ROOT,

  // Email engine — components, layouts, and Maizzle compilation
  engine: {
    root: ENGINE_ROOT,
    templates: path.join(ENGINE_ROOT, 'src', 'templates'),
    components: path.join(ENGINE_ROOT, 'src', 'components'),
    layouts: path.join(ENGINE_ROOT, 'src', 'layouts'),
    config: path.join(ENGINE_ROOT, 'config.js'),
  },
};
