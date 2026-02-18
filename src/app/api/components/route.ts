import { NextRequest, NextResponse } from 'next/server';
import { PATHS } from '@/lib/paths';
import { requireRole } from '@/lib/api-auth';
import { componentSchemas } from '@/lib/component-schemas';
import fs from 'fs';
import path from 'path';

export async function GET(req: NextRequest) {
  const { error } = await requireRole('developer', 'admin');
  if (error) return error;

  const name = req.nextUrl.searchParams.get('name');
  const componentsDir = path.join(PATHS.engine.components, 'core');

  if (name) {
    // Return specific component's raw HTML
    const filePath = path.join(componentsDir, `${name}.html`);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return NextResponse.json({ raw: content, filePath });
    } catch {
      return NextResponse.json({ error: 'Component not found' }, { status: 404 });
    }
  }

  // List all components with schema info
  try {
    const files = fs.readdirSync(componentsDir).filter(f => f.endsWith('.html'));
    const components = files.map(f => {
      const compName = f.replace('.html', '');
      const schema = componentSchemas[compName];
      return {
        name: compName,
        label: schema?.label || compName,
        propCount: schema?.props.filter(p => p.group !== 'System').length || 0,
      };
    });
    return NextResponse.json(components);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  const { error } = await requireRole('developer', 'admin');
  if (error) return error;

  try {
    const { name } = await req.json();
    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Component name is required' }, { status: 400 });
    }

    // Sanitize: lowercase, replace spaces/special chars with hyphens
    const safeName = name.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (!safeName) {
      return NextResponse.json({ error: 'Invalid component name' }, { status: 400 });
    }

    const componentsDir = path.join(PATHS.engine.components, 'core');
    const filePath = path.join(componentsDir, `${safeName}.html`);

    if (fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'Component already exists' }, { status: 409 });
    }

    // Create starter component with props-driven script
    const starter = `<script props>
  module.exports = {
    // Content
    body: props.body || 'Your content here',
    // Style
    padding: props.padding || '24px 48px',
    align: props.align || 'left',
    font: props.font || "Helvetica Neue, Helvetica, Arial, sans-serif",
    color: props.color || '#222222',
    bgColor: props['bg-color'] || '',
  };
</script>

<tr>
  <td style="text-align: {{ align }}; padding: {{ padding }}; font-family: {{ font }}; color: {{ color }};{{ bgColor ? ' background-color: ' + bgColor + ';' : '' }}">
    {{{ body }}}
  </td>
</tr>
`;

    fs.writeFileSync(filePath, starter, 'utf-8');
    return NextResponse.json({ name: safeName });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const { error } = await requireRole('developer', 'admin');
  if (error) return error;

  try {
    const { name, raw } = await req.json();

    if (!name || raw === undefined) {
      return NextResponse.json({ error: 'Missing name or raw content' }, { status: 400 });
    }

    const filePath = path.join(PATHS.engine.components, 'core', `${name}.html`);

    // Verify file exists before overwriting
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'Component not found' }, { status: 404 });
    }

    fs.writeFileSync(filePath, raw, 'utf-8');
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { error } = await requireRole('developer', 'admin');
  if (error) return error;

  try {
    const name = req.nextUrl.searchParams.get('name');
    if (!name) {
      return NextResponse.json({ error: 'Component name is required' }, { status: 400 });
    }

    const filePath = path.join(PATHS.engine.components, 'core', `${name}.html`);
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'Component not found' }, { status: 404 });
    }

    fs.unlinkSync(filePath);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
