import { parse as parseYaml } from 'yaml';

export interface ParsedComponent {
  type: string;          // e.g., "hero", "spacer", "copy"
  props: Record<string, string>;
  content?: string;      // inner HTML content for non-self-closing components
  raw?: string;          // original raw tag for reference
}

export interface ParsedTemplate {
  frontmatter: Record<string, string>;
  baseProps: Record<string, string>;
  components: ParsedComponent[];
  raw: string;           // original file content
}

export function parseTemplate(fileContent: string): ParsedTemplate {
  const raw = fileContent;

  // 1. Extract frontmatter
  const fmMatch = fileContent.match(/^---\n([\s\S]*?)\n---/);
  const frontmatter = fmMatch ? parseYaml(fmMatch[1]) : {};

  // 2. Get body (after frontmatter)
  const body = fmMatch ? fileContent.slice(fmMatch[0].length).trim() : fileContent.trim();

  // 3. Extract <x-base> props
  const baseMatch = body.match(/<x-base\s+([\s\S]*?)>/);
  const baseProps = baseMatch ? parseAttributes(baseMatch[1]) : {};

  // 4. Extract components
  const components: ParsedComponent[] = [];

  // Match both self-closing and open/close component tags
  // Self-closing: <x-core.name prop="value" />
  // Open/close: <x-core.name prop="value">content</x-core.name>
  const allComponentRegex = /<x-core\.(\w[\w-]*)([\s\S]*?)(?:\/>|>([\s\S]*?)<\/x-core\.\1>)/g;

  let match;
  while ((match = allComponentRegex.exec(body)) !== null) {
    const type = match[1];
    const attrString = match[2].trim();
    const content = match[3]?.trim() || undefined;
    const props = parseAttributes(attrString);

    components.push({
      type,
      props,
      content,
      raw: match[0],
    });
  }

  return { frontmatter, baseProps, components, raw };
}

function parseAttributes(attrString: string): Record<string, string> {
  const props: Record<string, string> = {};
  if (!attrString) return props;

  // Match key="value" or key='value' pairs, handling multiline
  const attrRegex = /([\w-]+)=(?:"([^"]*?)"|'([^']*?)')/g;
  let match;
  while ((match = attrRegex.exec(attrString)) !== null) {
    const key = match[1];
    const value = match[2] !== undefined ? match[2] : match[3];
    props[key] = value;
  }

  return props;
}
