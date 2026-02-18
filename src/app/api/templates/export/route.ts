import { NextRequest, NextResponse } from 'next/server';
import { PATHS } from '@/lib/paths';
import { requireRole } from '@/lib/api-auth';
import * as templateService from '@/lib/services/templates';
import { execSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * POST /api/templates/export
 *
 * Build and export one or more templates as compiled HTML.
 *
 * Body:
 *   { design: string }         → single template
 *   { designs: string[] }      → multiple templates
 *
 * Returns:
 *   Single  → { files: [{ name, html }] }
 *   Multiple → { files: [{ name, html }, ...] }
 */
export async function POST(req: NextRequest) {
  const { error } = await requireRole('developer', 'admin');
  if (error) return error;

  try {
    const body = await req.json();

    // Collect designs to build
    let designs: string[] = [];
    if (body.design) {
      designs = [body.design];
    } else if (Array.isArray(body.designs)) {
      designs = body.designs;
    } else {
      return NextResponse.json({ error: 'Provide "design" or "designs" array' }, { status: 400 });
    }

    const projectRoot = PATHS.engine.root;
    const files: { name: string; html: string }[] = [];
    const errors: { name: string; error: string }[] = [];

    for (const design of designs) {
      // Read template content from DB
      const template = await templateService.getTemplate(design);
      if (!template) {
        errors.push({ name: design, error: 'Template not found' });
        continue;
      }

      const uid = crypto.randomBytes(6).toString('hex');
      const tempDir = path.join(projectRoot, 'src', 'templates', `_export_${uid}`);
      const tempFile = path.join(tempDir, 'template.html');
      const scriptFile = path.join(projectRoot, `_export-${uid}.mjs`);

      try {
        // Write template content to temp file for Maizzle compilation
        fs.mkdirSync(tempDir, { recursive: true });
        fs.writeFileSync(tempFile, template.content, 'utf-8');

        const scriptContent = `
import { render } from '@maizzle/framework';
import fs from 'fs';

const template = fs.readFileSync(${JSON.stringify(tempFile)}, 'utf-8');
const result = await render(template, {
  components: {
    root: '.',
    folders: ['src/components', 'src/layouts'],
  },
  css: { inline: true, purge: true },
  prettify: true,
});

process.stdout.write(JSON.stringify({ html: result.html }));
`;
        fs.writeFileSync(scriptFile, scriptContent);

        const output = execSync(`node _export-${uid}.mjs`, {
          cwd: projectRoot,
          timeout: 30000,
          encoding: 'utf-8',
          env: { ...process.env, NODE_NO_WARNINGS: '1' },
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        const jsonStart = output.indexOf('{"html":');
        if (jsonStart === -1) {
          errors.push({ name: design, error: 'No output from Maizzle render' });
          continue;
        }

        const result = JSON.parse(output.slice(jsonStart));
        files.push({ name: `${design}.html`, html: result.html });
      } catch (err: any) {
        errors.push({ name: design, error: err?.message || 'Build failed' });
      } finally {
        try { fs.unlinkSync(scriptFile); } catch {}
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
      }
    }

    return NextResponse.json({ files, errors: errors.length > 0 ? errors : undefined });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Export failed' },
      { status: 500 },
    );
  }
}
