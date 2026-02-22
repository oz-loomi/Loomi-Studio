import type { ParsedTemplate, ParsedComponent } from './template-parser';

export function serializeTemplate(template: ParsedTemplate): string {
  const lines: string[] = [];

  // 1. Frontmatter
  lines.push('---');
  // Serialize frontmatter preserving order
  for (const [key, value] of Object.entries(template.frontmatter)) {
    if (typeof value === 'string' && (value.includes(':') || value.includes('{') || value.includes('"'))) {
      lines.push(`${key}: "${value}"`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push('---');
  lines.push('');

  // 2. <x-base> opening
  const basePropStr = serializeAttributes(template.baseProps);
  lines.push(`<x-base ${basePropStr}>`);

  // 3. Components (inject component-index for scoped responsive CSS)
  for (let i = 0; i < template.components.length; i++) {
    const comp = template.components[i];
    const compWithIndex: ParsedComponent = {
      ...comp,
      props: { ...comp.props, 'component-index': String(i) },
    };
    lines.push('');
    lines.push(serializeComponent(compWithIndex));
  }

  // 4. Close </x-base>
  lines.push('');
  lines.push('</x-base>');
  lines.push('');

  return lines.join('\n');
}

function serializeComponent(comp: ParsedComponent): string {
  const propEntries = Object.entries(comp.props);

  if (propEntries.length <= 2) {
    // Short form - single line
    const attrStr = propEntries.map(([k, v]) => `${k}="${v}"`).join(' ');
    if (comp.content) {
      return `  <x-core.${comp.type} ${attrStr}>${comp.content}</x-core.${comp.type}>`;
    }
    return `  <x-core.${comp.type} ${attrStr} />`;
  }

  // Multi-line form
  const lines = [`  <x-core.${comp.type}`];
  for (const [key, value] of propEntries) {
    lines.push(`    ${key}="${value}"`);
  }

  if (comp.content) {
    lines[lines.length - 1] += '>';
    lines.push(`    ${comp.content}`);
    lines.push(`  </x-core.${comp.type}>`);
  } else {
    lines.push('  />');
  }

  return lines.join('\n');
}

function serializeAttributes(attrs: Record<string, string>): string {
  return Object.entries(attrs)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');
}
