export type FieldType = 'text' | 'textarea' | 'color' | 'url' | 'image' | 'select' | 'toggle' | 'number' | 'padding' | 'radius' | 'unit';

export interface PropSchema {
  key: string;
  label: string;
  type: FieldType;
  default?: string;
  options?: { label: string; value: string }[];
  group?: string;
  required?: boolean;
  description?: string;
  half?: boolean; // Render at half-width, side-by-side with adjacent half prop
  repeatableGroup?: string; // Which repeatable group this prop belongs to
  placeholder?: string;
  conditionalOn?: string; // Only show this prop when the referenced prop's value is truthy (e.g. 'true')
  buttonSet?: 'primary' | 'secondary'; // Which button tab this prop belongs to
  responsive?: boolean; // Allow mobile-specific override via m: prefix
  separator?: boolean; // Render a visual divider line before this prop
}

export interface RepeatableGroup {
  key: string;         // e.g. "feature", "stat", "social"
  label: string;       // e.g. "Feature", "Stat", "Social Link"
  maxItems: number;    // Maximum number of items
  propsPerItem: string[]; // Prop key patterns per item (use {n} as placeholder for index)
}

export interface ComponentSchema {
  name: string;
  label: string;
  icon: string;
  props: PropSchema[];
  repeatableGroups?: RepeatableGroup[];
}

// ── Shared options & helpers ──

const BORDER_STYLE_OPTIONS = [
  { label: 'None', value: 'none' },
  { label: 'Solid', value: 'solid' },
  { label: 'Dashed', value: 'dashed' },
  { label: 'Dotted', value: 'dotted' },
];

const ALIGN_OPTIONS = [
  { label: 'Left', value: 'left' },
  { label: 'Center', value: 'center' },
  { label: 'Right', value: 'right' },
];

const GRADIENT_DIRECTION_OPTIONS = [
  { label: 'To Bottom', value: 'to bottom' },
  { label: 'To Top', value: 'to top' },
  { label: 'To Right', value: 'to right' },
  { label: 'To Left', value: 'to left' },
  { label: 'To Bottom Right', value: 'to bottom right' },
  { label: 'To Bottom Left', value: 'to bottom left' },
  { label: 'To Top Right', value: 'to top right' },
  { label: 'To Top Left', value: 'to top left' },
];

const FONT_WEIGHT_OPTIONS = [
  { label: '400 (Normal)', value: '400' },
  { label: '500 (Medium)', value: '500' },
  { label: '600 (Semibold)', value: '600' },
  { label: '700 (Bold)', value: '700' },
  { label: '800 (Extra Bold)', value: '800' },
];

const TEXT_TRANSFORM_OPTIONS = [
  { label: 'None', value: 'none' },
  { label: 'Uppercase', value: 'uppercase' },
  { label: 'Lowercase', value: 'lowercase' },
  { label: 'Capitalize', value: 'capitalize' },
];

/** Generate the "all sides" border shorthand + per-side border props */
function borderProps(prefix = 'border', defaultWidth = '0px'): PropSchema[] {
  const p = prefix === 'border' ? 'border' : prefix;
  return [
    // All-sides shorthand
    { key: `${p}-color`, label: 'Color', type: 'color', half: true, group: 'border' },
    { key: `${p}-width`, label: 'Width', type: 'unit', half: true, default: defaultWidth, group: 'border' },
    { key: `${p}-style`, label: 'Style', type: 'select', half: true, group: 'border', options: BORDER_STYLE_OPTIONS },
    // Per-side
    { key: `${p}-top-color`, label: 'Top Color', type: 'color', half: true, group: 'border' },
    { key: `${p}-top-width`, label: 'Top Width', type: 'unit', half: true, group: 'border' },
    { key: `${p}-top-style`, label: 'Top Style', type: 'select', half: true, group: 'border', options: BORDER_STYLE_OPTIONS },
    { key: `${p}-right-color`, label: 'Right Color', type: 'color', half: true, group: 'border' },
    { key: `${p}-right-width`, label: 'Right Width', type: 'unit', half: true, group: 'border' },
    { key: `${p}-right-style`, label: 'Right Style', type: 'select', half: true, group: 'border', options: BORDER_STYLE_OPTIONS },
    { key: `${p}-bottom-color`, label: 'Bottom Color', type: 'color', half: true, group: 'border' },
    { key: `${p}-bottom-width`, label: 'Bottom Width', type: 'unit', half: true, group: 'border' },
    { key: `${p}-bottom-style`, label: 'Bottom Style', type: 'select', half: true, group: 'border', options: BORDER_STYLE_OPTIONS },
    { key: `${p}-left-color`, label: 'Left Color', type: 'color', half: true, group: 'border' },
    { key: `${p}-left-width`, label: 'Left Width', type: 'unit', half: true, group: 'border' },
    { key: `${p}-left-style`, label: 'Left Style', type: 'select', half: true, group: 'border', options: BORDER_STYLE_OPTIONS },
  ];
}

/** Generate gradient props for the background group */
function gradientProps(): PropSchema[] {
  return [
    { key: 'gradient-type', label: 'Gradient', type: 'select', group: 'background', options: [
      { label: 'None', value: 'none' }, { label: 'Linear', value: 'linear' }, { label: 'Radial', value: 'radial' },
    ]},
    { key: 'gradient-angle', label: 'Angle', type: 'number', half: true, group: 'background', default: '180' },
    { key: 'gradient-direction', label: 'Direction', type: 'select', half: true, group: 'background', options: GRADIENT_DIRECTION_OPTIONS },
    { key: 'gradient-start', label: 'Start', type: 'color', half: true, group: 'background' },
    { key: 'gradient-start-position', label: 'Start Location', type: 'number', half: true, group: 'background', default: '0' },
    { key: 'gradient-end', label: 'End', type: 'color', half: true, group: 'background' },
    { key: 'gradient-end-position', label: 'End Location', type: 'number', half: true, group: 'background', default: '100' },
  ];
}

/** Generate full button design props */
function buttonProps(prefix: string, set?: 'primary' | 'secondary'): PropSchema[] {
  const bs = set ? { buttonSet: set } : {};
  return [
    { key: `${prefix}-text`, label: 'Text', type: 'text', group: 'buttons', ...bs },
    { key: `${prefix}-url`, label: 'URL', type: 'url', group: 'buttons', ...bs },
    { key: `${prefix}-padding`, label: 'Padding', type: 'padding', group: 'buttons', responsive: true, ...bs },
    { key: `${prefix}-bg-color`, label: 'Background', type: 'color', half: true, group: 'buttons', separator: true, ...bs },
    { key: `${prefix}-text-color`, label: 'Text Color', type: 'color', half: true, group: 'buttons', ...bs },
    { key: `${prefix}-border-style`, label: 'Border Type', type: 'select', group: 'buttons', options: BORDER_STYLE_OPTIONS, separator: true, ...bs },
    { key: `${prefix}-border-width`, label: 'Border Width', type: 'unit', half: true, group: 'buttons', default: '0px', ...bs },
    { key: `${prefix}-border-color`, label: 'Border Color', type: 'color', half: true, group: 'buttons', ...bs },
    { key: `${prefix}-radius`, label: 'Border Radius', type: 'radius', group: 'buttons', responsive: true, ...bs },
    { key: `${prefix}-font-size`, label: 'Font Size', separator: true, type: 'unit', half: true, group: 'buttons', responsive: true, ...bs },
    { key: `${prefix}-font-weight`, label: 'Font Weight', type: 'select', half: true, group: 'buttons', options: FONT_WEIGHT_OPTIONS, ...bs },
    { key: `${prefix}-letter-spacing`, label: 'Letter Spacing', type: 'unit', half: true, group: 'buttons', responsive: true, ...bs },
    { key: `${prefix}-text-transform`, label: 'Text Transform', type: 'select', half: true, group: 'buttons', options: TEXT_TRANSFORM_OPTIONS, ...bs },
  ];
}

/** Generate full UTM tracking props */
function trackingProps({
  prefix = '',
  buttonSet,
  conditionalOn,
  defaultSource = 'email',
  defaultMedium = 'lifecycle',
}: {
  prefix?: string;
  buttonSet?: 'primary' | 'secondary';
  conditionalOn?: string;
  defaultSource?: string;
  defaultMedium?: string;
} = {}): PropSchema[] {
  const k = (key: string) => `${prefix}${key}`;
  const setMeta = buttonSet ? { buttonSet } : {};
  const condMeta = conditionalOn ? { conditionalOn } : {};
  return [
    { key: k('utm-source'), label: 'UTM Source', type: 'text', half: true, default: defaultSource, group: 'tracking', ...setMeta, ...condMeta },
    { key: k('utm-medium'), label: 'UTM Medium', type: 'text', half: true, default: defaultMedium, group: 'tracking', ...setMeta, ...condMeta },
    { key: k('utm-campaign'), label: 'UTM Campaign', type: 'text', group: 'tracking', ...setMeta, ...condMeta },
    { key: k('utm-content'), label: 'UTM Content', type: 'text', half: true, group: 'tracking', ...setMeta, ...condMeta },
    { key: k('utm-term'), label: 'UTM Term', type: 'text', half: true, group: 'tracking', ...setMeta, ...condMeta },
  ];
}

// ── Component schemas ──

export const componentSchemas: Record<string, ComponentSchema> = {
  hero: {
    name: 'hero',
    label: 'Hero Banner',
    icon: 'PhotoIcon',
    props: [
      // ── Text ──
      { key: 'eyebrow', label: 'Eyebrow', type: 'text', group: 'text' },
      { key: 'headline', label: 'Headline', type: 'text', required: true, group: 'text' },
      { key: 'subheadline', label: 'Subheadline', type: 'textarea', group: 'text' },
      { key: 'eyebrow-size', label: 'Eyebrow Size', separator: true, type: 'unit', half: true, group: 'text', responsive: true },
      { key: 'eyebrow-color', label: 'Eyebrow Color', type: 'color', half: true, group: 'text' },
      { key: 'headline-size', label: 'Headline Size', type: 'unit', half: true, group: 'text', responsive: true },
      { key: 'headline-color', label: 'Headline Color', type: 'color', half: true, group: 'text' },
      { key: 'subheadline-size', label: 'Sub Size', type: 'unit', half: true, group: 'text', responsive: true },
      { key: 'subheadline-color', label: 'Sub Color', type: 'color', half: true, group: 'text' },
      // ── Background ──
      { key: 'bg-image', label: 'Background Image', type: 'image', group: 'background' },
      { key: 'fallback-bg', label: 'Fallback Color', type: 'color', group: 'background' },
      { key: 'overlay-opacity', label: 'Image Overlay Opacity', type: 'number', group: 'background', default: '0', placeholder: '0-100' },
      { key: 'gradient', label: 'Gradient Overlay (CSS)', type: 'text', group: 'background', placeholder: 'linear-gradient(...)' },
      ...gradientProps(),
      // ── Buttons ──
      ...buttonProps('primary-button', 'primary'),
      { key: 'button-gap', label: 'Button Gap', type: 'unit', group: 'buttons', responsive: true, buttonSet: 'secondary' },
      ...buttonProps('secondary-button', 'secondary'),
      // ── Layout ──
      { key: 'hero-height', label: 'Height', type: 'unit', default: '500px', group: 'layout', responsive: true },
      { key: 'text-align', label: 'Text Align', type: 'select', group: 'layout', options: ALIGN_OPTIONS, responsive: true },
      { key: 'content-valign', label: 'Vertical Align', type: 'select', group: 'layout', options: [
        { label: 'Top', value: 'top' }, { label: 'Middle', value: 'middle' }, { label: 'Bottom', value: 'bottom' },
      ], responsive: true },
      { key: 'content-padding', label: 'Content Padding', type: 'padding', default: '48px', group: 'layout', responsive: true },
      // ── Border ──
      { key: 'border-radius', label: 'Border Radius', type: 'radius', group: 'border', responsive: true },
      ...borderProps(),
      // ── Tracking ──
      ...trackingProps({ buttonSet: 'primary' }),
      ...trackingProps({
        prefix: 'secondary-',
        buttonSet: 'secondary',
        conditionalOn: 'secondary-button-text',
        defaultSource: '',
        defaultMedium: '',
      }),
    ],
  },

  spacer: {
    name: 'spacer',
    label: 'Spacer',
    icon: 'ArrowsUpDownIcon',
    props: [
      // ── Layout ──
      { key: 'size', label: 'Height', type: 'unit', default: '48px', group: 'layout', responsive: true },
      // ── Background ──
      { key: 'bg-color', label: 'Background', type: 'color', group: 'background' },
    ],
  },

  copy: {
    name: 'copy',
    label: 'Copy Block',
    icon: 'TextIcon',
    props: [
      // ── Text ──
      { key: 'greeting', label: 'Greeting', type: 'text', group: 'text' },
      { key: 'body', label: 'Body Text', type: 'textarea', required: true, group: 'text' },
      { key: 'greeting-size', label: 'Greeting Size', separator: true, type: 'unit', half: true, group: 'text', responsive: true },
      { key: 'greeting-color', label: 'Greeting Color', type: 'color', half: true, group: 'text' },
      { key: 'body-size', label: 'Body Size', type: 'unit', half: true, group: 'text', responsive: true },
      { key: 'body-color', label: 'Body Color', type: 'color', half: true, group: 'text' },
      { key: 'line-height', label: 'Line Height', type: 'unit', group: 'text', responsive: true },
      // ── Background ──
      { key: 'bg-color', label: 'Background Color', type: 'color', group: 'background' },
      { key: 'bg-image', label: 'Background Image', type: 'image', group: 'background' },
      // ── Layout ──
      { key: 'align', label: 'Alignment', type: 'select', group: 'layout', options: ALIGN_OPTIONS, responsive: true },
      { key: 'padding', label: 'Padding', type: 'padding', group: 'layout', responsive: true },
      // ── Border ──
      ...borderProps(),
    ],
  },

  cta: {
    name: 'cta',
    label: 'Button',
    icon: 'ButtonIcon',
    props: [
      // ── Buttons ──
      ...buttonProps('button'),
      { key: 'show-phone', label: 'Show Phone', type: 'toggle', half: true, default: 'true', group: 'buttons' },
      { key: 'phone-text', label: 'Phone Text', type: 'text', half: true, group: 'buttons' },
      { key: 'phone-color', label: 'Phone Color', type: 'color', half: true, group: 'buttons' },
      { key: 'phone-link-color', label: 'Phone Link', type: 'color', half: true, group: 'buttons' },
      // ── Background ──
      { key: 'section-bg-color', label: 'Section BG', type: 'color', group: 'background' },
      // ── Layout ──
      { key: 'align', label: 'Alignment', type: 'select', group: 'layout', options: ALIGN_OPTIONS, responsive: true },
      { key: 'section-padding', label: 'Padding', type: 'padding', group: 'layout', responsive: true },
      // ── Border ──
      ...borderProps('section-border'),
      // ── Tracking ──
      ...trackingProps(),
    ],
  },

  'vehicle-card': {
    name: 'vehicle-card',
    label: 'Vehicle Card',
    icon: 'CarIcon',
    props: [
      // ── Stats (above text, always visible) ──
      { key: 'show-stats', label: 'Show Stats', type: 'toggle', group: 'stats' },
      { key: 'stat-1-label', label: 'Stat 1 Label', type: 'text', half: true, group: 'stats' },
      { key: 'stat-1-value', label: 'Stat 1 Value', type: 'text', half: true, group: 'stats' },
      { key: 'stat-2-label', label: 'Stat 2 Label', type: 'text', half: true, group: 'stats' },
      { key: 'stat-2-value', label: 'Stat 2 Value', type: 'text', half: true, group: 'stats' },
      { key: 'stat-label-color', label: 'Label Color', separator: true, type: 'color', half: true, group: 'stats' },
      { key: 'stat-value-color', label: 'Value Color', type: 'color', half: true, group: 'stats' },
      { key: 'stat-divider-width', label: 'Inner Border Width', type: 'unit', half: true, default: '0.5px', group: 'stats' },
      { key: 'stat-divider-color', label: 'Inner Border Color', type: 'color', half: true, group: 'stats' },
      // ── Text ──
      { key: 'card-label', label: 'Card Label', type: 'text', default: 'Your Vehicle', group: 'text' },
      { key: 'vehicle-year', label: 'Year', type: 'text', half: true, default: '{{contact.vehicle_year}}', group: 'text' },
      { key: 'vehicle-make', label: 'Make', type: 'text', half: true, default: '{{contact.vehicle_make}}', group: 'text' },
      { key: 'vehicle-model', label: 'Model', type: 'text', half: true, group: 'text', default: '{{contact.vehicle_model}}' },
      { key: 'label-color', label: 'Label Color', separator: true, type: 'color', half: true, group: 'text' },
      { key: 'vehicle-color', label: 'Vehicle Color', type: 'color', half: true, group: 'text' },
      // ── Background ──
      { key: 'section-bg-color', label: 'Section BG', type: 'color', half: true, group: 'background' },
      { key: 'bg-color', label: 'Card BG', type: 'color', half: true, group: 'background' },
      { key: 'accent-color', label: 'Accent', type: 'color', half: true, group: 'background' },
      ...gradientProps(),
      // ── Layout ──
      { key: 'radius', label: 'Border Radius', type: 'radius', group: 'border', responsive: true },
      { key: 'padding', label: 'Padding', type: 'padding', group: 'layout', responsive: true },
      // ── Border ──
      ...borderProps('border', '1px'),
    ],
  },

  features: {
    name: 'features',
    label: 'Features Grid',
    icon: 'GridIcon',
    repeatableGroups: [
      {
        key: 'feature',
        label: 'Feature',
        maxItems: 4,
        propsPerItem: ['feature{n}', 'feature{n}-desc', 'feature{n}-icon', 'feature{n}-image'],
      },
    ],
    props: [
      // ── Text ──
      { key: 'section-title', label: 'Section Title', type: 'text', group: 'text' },
      { key: 'title-color', label: 'Title Color', type: 'color', half: true, group: 'text' },
      { key: 'text-color', label: 'Text Color', type: 'color', half: true, group: 'text' },
      // ── Background ──
      { key: 'bg-color', label: 'Background', type: 'color', half: true, group: 'background' },
      { key: 'card-bg-color', label: 'Card BG', type: 'color', half: true, group: 'background' },
      { key: 'accent-color', label: 'Accent Color', type: 'color', group: 'background' },
      ...gradientProps(),
      // ── Layout ──
      { key: 'variant', label: 'Variant', type: 'select', group: 'layout', options: [
        { label: 'Icon', value: 'icon' }, { label: 'Image', value: 'image' },
      ]},
      { key: 'card-radius', label: 'Card Border Radius', type: 'radius', group: 'layout', responsive: true },
      { key: 'padding', label: 'Padding', type: 'padding', group: 'layout', responsive: true },
      // ── Border ──
      ...borderProps(),
      // ── Repeatable (no group) ──
      { key: 'feature1', label: 'Title', type: 'text', repeatableGroup: 'feature' },
      { key: 'feature1-desc', label: 'Description', type: 'textarea', repeatableGroup: 'feature' },
      { key: 'feature1-icon', label: 'Icon URL', type: 'image', half: true, repeatableGroup: 'feature' },
      { key: 'feature1-image', label: 'Image URL', type: 'image', half: true, repeatableGroup: 'feature' },
      { key: 'feature2', label: 'Title', type: 'text', repeatableGroup: 'feature' },
      { key: 'feature2-desc', label: 'Description', type: 'textarea', repeatableGroup: 'feature' },
      { key: 'feature2-icon', label: 'Icon URL', type: 'image', half: true, repeatableGroup: 'feature' },
      { key: 'feature2-image', label: 'Image URL', type: 'image', half: true, repeatableGroup: 'feature' },
      { key: 'feature3', label: 'Title', type: 'text', repeatableGroup: 'feature' },
      { key: 'feature3-desc', label: 'Description', type: 'textarea', repeatableGroup: 'feature' },
      { key: 'feature3-icon', label: 'Icon URL', type: 'image', half: true, repeatableGroup: 'feature' },
      { key: 'feature3-image', label: 'Image URL', type: 'image', half: true, repeatableGroup: 'feature' },
      { key: 'feature4', label: 'Title', type: 'text', repeatableGroup: 'feature' },
      { key: 'feature4-desc', label: 'Description', type: 'textarea', repeatableGroup: 'feature' },
      { key: 'feature4-icon', label: 'Icon URL', type: 'image', half: true, repeatableGroup: 'feature' },
      { key: 'feature4-image', label: 'Image URL', type: 'image', half: true, repeatableGroup: 'feature' },
    ],
  },

  image: {
    name: 'image',
    label: 'Image',
    icon: 'PhotoIcon',
    props: [
      // ── Text ──
      { key: 'alt', label: 'Alt Text', type: 'text', group: 'text' },
      // ── Background ──
      { key: 'image', label: 'Image URL', type: 'image', required: true, group: 'background' },
      // ── Layout ──
      { key: 'width', label: 'Width', type: 'unit', half: true, default: '600px', group: 'layout', responsive: true },
      { key: 'max-height', label: 'Max Height', type: 'unit', half: true, group: 'layout', responsive: true },
      { key: 'radius', label: 'Border Radius', type: 'radius', group: 'layout', responsive: true },
      { key: 'padding', label: 'Padding', type: 'padding', group: 'layout', responsive: true },
      // ── Border ──
      ...borderProps(),
    ],
  },

  'image-overlay': {
    name: 'image-overlay',
    label: 'Image Overlay',
    icon: 'PaintBrushIcon',
    props: [
      // ── Text ──
      { key: 'heading', label: 'Heading', type: 'text', group: 'text' },
      { key: 'description', label: 'Description', type: 'textarea', group: 'text' },
      { key: 'heading-size', label: 'Heading Size', separator: true, type: 'unit', half: true, group: 'text', responsive: true },
      { key: 'heading-color', label: 'Heading Color', type: 'color', half: true, group: 'text' },
      // ── Background ──
      { key: 'image', label: 'Background Image', type: 'image', required: true, group: 'background' },
      { key: 'overlay', label: 'Overlay Preset', type: 'select', group: 'background', options: [
        { label: 'Light', value: 'light' }, { label: 'Medium', value: 'medium' },
        { label: 'Dark', value: 'dark' }, { label: 'Heavy', value: 'heavy' },
      ]},
      // ── Buttons ──
      ...buttonProps('button'),
      // ── Layout ──
      { key: 'align', label: 'Alignment', type: 'select', group: 'layout', options: ALIGN_OPTIONS, responsive: true },
      { key: 'content-padding', label: 'Content Padding', type: 'padding', group: 'layout', responsive: true },
      // ── Border ──
      ...borderProps(),
      // ── Tracking ──
      ...trackingProps(),
    ],
  },

  'image-card-overlay': {
    name: 'image-card-overlay',
    label: 'Image Card Overlay',
    icon: 'RectangleGroupIcon',
    props: [
      // ── Text ──
      { key: 'eyebrow', label: 'Eyebrow', type: 'text', group: 'text' },
      { key: 'headline', label: 'Headline', type: 'text', group: 'text' },
      { key: 'body', label: 'Body', type: 'textarea', group: 'text' },
      { key: 'eyebrow-color', label: 'Eyebrow Color', separator: true, type: 'color', half: true, group: 'text' },
      { key: 'headline-color', label: 'Headline Color', type: 'color', half: true, group: 'text' },
      { key: 'body-color', label: 'Body Color', type: 'color', group: 'text' },
      // ── Background ──
      { key: 'background-image', label: 'Background Image', type: 'image', required: true, group: 'background' },
      { key: 'card-background', label: 'Card BG', type: 'color', group: 'background' },
      // ── Buttons ──
      ...buttonProps('cta'),
      // ── Layout ──
      { key: 'card-align', label: 'Card Align', type: 'select', group: 'layout', options: ALIGN_OPTIONS, responsive: true },
      { key: 'card-max-width', label: 'Card Max Width', type: 'unit', group: 'layout', responsive: true },
      { key: 'card-padding', label: 'Card Padding', type: 'padding', group: 'layout', responsive: true },
      { key: 'card-radius', label: 'Card Border Radius', type: 'radius', group: 'layout', responsive: true },
      // ── Border ──
      ...borderProps(),
      // ── Tracking ──
      ...trackingProps(),
    ],
  },

  divider: {
    name: 'divider',
    label: 'Divider',
    icon: 'MinusIcon',
    props: [
      // ── Border (the divider IS a border line) ──
      { key: 'color', label: 'Color', type: 'color', group: 'border' },
      { key: 'thickness', label: 'Thickness', type: 'unit', half: true, default: '1px', group: 'border' },
      { key: 'style', label: 'Style', type: 'select', half: true, group: 'border', options: [
        { label: 'Solid', value: 'solid' }, { label: 'Dashed', value: 'dashed' }, { label: 'Dotted', value: 'dotted' },
      ]},
      // ── Background ──
      { key: 'bg-color', label: 'Background', type: 'color', group: 'background' },
      // ── Layout ──
      { key: 'padding', label: 'Padding', type: 'padding', group: 'layout', responsive: true },
      { key: 'margin', label: 'Margin', type: 'padding', group: 'layout', responsive: true },
    ],
  },

  'countdown-stat': {
    name: 'countdown-stat',
    label: 'Countdown Stat',
    icon: 'CountdownIcon',
    props: [
      // ── Text ──
      { key: 'label', label: 'Label', type: 'text', half: true, group: 'text' },
      { key: 'value', label: 'Value', type: 'text', half: true, required: true, group: 'text' },
      { key: 'caption', label: 'Caption', type: 'text', group: 'text' },
      { key: 'value-size', label: 'Value Size', separator: true, type: 'unit', half: true, group: 'text', responsive: true },
      { key: 'value-color', label: 'Value Color', type: 'color', half: true, group: 'text' },
      { key: 'label-color', label: 'Label Color', type: 'color', half: true, group: 'text' },
      { key: 'caption-color', label: 'Caption Color', type: 'color', half: true, group: 'text' },
      // ── Background ──
      { key: 'bg-color', label: 'Background', type: 'color', group: 'background' },
      ...gradientProps(),
      // ── Layout ──
      { key: 'align', label: 'Alignment', type: 'select', group: 'layout', options: ALIGN_OPTIONS, responsive: true },
      { key: 'radius', label: 'Border Radius', type: 'radius', group: 'layout', responsive: true },
      { key: 'padding', label: 'Padding', type: 'padding', group: 'layout', responsive: true },
      // ── Border ──
      ...borderProps(),
    ],
  },

  testimonial: {
    name: 'testimonial',
    label: 'Testimonial',
    icon: 'ChatBubbleLeftIcon',
    props: [
      // ── Text ──
      { key: 'quote', label: 'Quote', type: 'textarea', required: true, group: 'text' },
      { key: 'author', label: 'Author', type: 'text', half: true, group: 'text' },
      { key: 'source', label: 'Source', type: 'text', half: true, group: 'text' },
      { key: 'quote-color', label: 'Quote Color', separator: true, type: 'color', half: true, group: 'text' },
      { key: 'author-color', label: 'Author Color', type: 'color', half: true, group: 'text' },
      { key: 'source-color', label: 'Source Color', type: 'color', group: 'text' },
      // ── Background ──
      { key: 'bg-color', label: 'Background', type: 'color', half: true, group: 'background' },
      { key: 'accent-color', label: 'Accent', type: 'color', half: true, group: 'background' },
      ...gradientProps(),
      // ── Layout ──
      { key: 'align', label: 'Alignment', type: 'select', group: 'layout', options: ALIGN_OPTIONS, responsive: true },
      { key: 'radius', label: 'Border Radius', type: 'radius', group: 'layout', responsive: true },
      { key: 'padding', label: 'Padding', type: 'padding', group: 'layout', responsive: true },
      // ── Border ──
      ...borderProps('border', '0.5px'),
    ],
  },

  split: {
    name: 'split',
    label: 'Split Section',
    icon: 'SplitIcon',
    props: [
      // ── Text ──
      { key: 'eyebrow', label: 'Eyebrow', type: 'text', group: 'text' },
      { key: 'headline', label: 'Headline', type: 'text', required: true, group: 'text' },
      { key: 'description', label: 'Description', type: 'textarea', group: 'text' },
      { key: 'eyebrow-size', label: 'Eyebrow Size', separator: true, type: 'unit', half: true, group: 'text', responsive: true },
      { key: 'eyebrow-color', label: 'Eyebrow Color', type: 'color', half: true, group: 'text' },
      { key: 'headline-size', label: 'Headline Size', type: 'unit', half: true, group: 'text', responsive: true },
      { key: 'headline-color', label: 'Headline Color', type: 'color', half: true, group: 'text' },
      { key: 'description-size', label: 'Desc Size', type: 'unit', half: true, group: 'text', responsive: true },
      { key: 'description-color', label: 'Desc Color', type: 'color', half: true, group: 'text' },
      // ── Background ──
      { key: 'image', label: 'Image', type: 'image', required: true, group: 'background' },
      { key: 'image-alt', label: 'Image Alt Text', type: 'text', group: 'background' },
      { key: 'image-fit', label: 'Image Fit', type: 'select', group: 'background', options: [
        { label: 'Auto', value: 'auto' }, { label: 'Cover', value: 'cover' },
      ]},
      { key: 'image-position', label: 'Image Position', type: 'text', default: 'center center', placeholder: 'center center', group: 'background' },
      { key: 'bg-color', label: 'Section Background', type: 'color', half: true, group: 'background' },
      { key: 'text-bg-color', label: 'Text Column BG', type: 'color', half: true, group: 'background' },
      // ── Buttons ──
      ...buttonProps('primary-button', 'primary'),
      { key: 'button-gap', label: 'Button Gap', type: 'unit', default: '12px', group: 'buttons', responsive: true, buttonSet: 'secondary' },
      ...buttonProps('secondary-button', 'secondary'),
      // ── Layout ──
      { key: 'image-side', label: 'Image Side', type: 'select', group: 'layout', options: [
        { label: 'Left', value: 'left' }, { label: 'Right', value: 'right' },
      ]},
      { key: 'text-align', label: 'Text Align', type: 'select', group: 'layout', options: ALIGN_OPTIONS, responsive: true },
      { key: 'content-valign', label: 'Vertical Align', type: 'select', group: 'layout', options: [
        { label: 'Top', value: 'top' }, { label: 'Middle', value: 'middle' }, { label: 'Bottom', value: 'bottom' },
      ] },
      { key: 'content-padding', label: 'Text Padding', type: 'padding', default: '32px', group: 'layout', responsive: true },
      // ── Border ──
      { key: 'border-radius', label: 'Border Radius', type: 'radius', group: 'border', responsive: true },
      ...borderProps(),
      // ── Tracking ──
      ...trackingProps({ buttonSet: 'primary' }),
      ...trackingProps({
        prefix: 'secondary-',
        buttonSet: 'secondary',
        conditionalOn: 'secondary-button-text',
        defaultSource: '',
        defaultMedium: '',
      }),
    ],
  },

  header: {
    name: 'header',
    label: 'Header',
    icon: 'HeaderIcon',
    props: [
      // ── Logo & Background ──
      { key: 'logo-url', label: 'Logo URL', type: 'image', group: 'background' },
      { key: 'logo-alt', label: 'ALT', type: 'text', group: 'background' },
      { key: 'bg-color', label: 'Background', type: 'color', group: 'background' },
      // ── Buttons ──
      { key: 'link-url', label: 'Link URL', type: 'url', group: 'buttons' },
      // ── Layout ──
      { key: 'align', label: 'Alignment', type: 'select', group: 'layout', options: ALIGN_OPTIONS, responsive: true },
      { key: 'logo-width', label: 'Logo Width', type: 'unit', group: 'layout', responsive: true },
      { key: 'padding', label: 'Padding', type: 'padding', default: '35px', group: 'layout', responsive: true },
      // ── Border ──
      { key: 'border-radius', label: 'Border Radius', type: 'radius', group: 'border', responsive: true },
    ],
  },

  footer: {
    name: 'footer',
    label: 'Footer',
    icon: 'FooterIcon',
    repeatableGroups: [
      {
        key: 'social',
        label: 'Social Link',
        maxItems: 6,
        propsPerItem: ['facebook-url', 'instagram-url', 'youtube-url', 'linkedin-url', 'tiktok-url', 'x-url'],
      },
    ],
    props: [
      // ── Text ──
      { key: 'dealer-name', label: 'Business Name', type: 'text', group: 'text' },
      { key: 'text-color', label: 'Text Color', type: 'color', half: true, group: 'text' },
      { key: 'dealer-name-color', label: 'Name Color', type: 'color', half: true, group: 'text' },
      { key: 'link-color', label: 'Link Color', type: 'color', half: true, group: 'text' },
      { key: 'phone-color', label: 'Phone Color', type: 'color', half: true, group: 'text' },
      { key: 'copyright-color', label: 'Copyright Color', separator: true, type: 'color', group: 'text' },
      // ── Background ──
      { key: 'logo-url', label: 'Logo URL', type: 'image', group: 'background' },
      { key: 'bg-color', label: 'Background', type: 'color', half: true, group: 'background' },
      { key: 'icon-color', label: 'Icon Color', type: 'color', half: true, group: 'background' },
      // ── Layout ──
      { key: 'variant', label: 'Style', type: 'select', group: 'layout', options: [
        { label: 'Dealer', value: 'dealer' }, { label: 'Brand', value: 'brand' },
      ]},
      { key: 'logo-width', label: 'Logo Width', type: 'unit', group: 'layout', responsive: true },
      { key: 'container-padding', label: 'Padding', type: 'padding', group: 'layout', responsive: true },
      // ── Border ──
      { key: 'divider-color', label: 'Divider Color', type: 'color', group: 'border' },
      // ── Repeatable (no group) ──
      { key: 'facebook-url', label: 'Facebook', type: 'url', repeatableGroup: 'social' },
      { key: 'instagram-url', label: 'Instagram', type: 'url', repeatableGroup: 'social' },
      { key: 'youtube-url', label: 'YouTube', type: 'url', repeatableGroup: 'social' },
      { key: 'linkedin-url', label: 'LinkedIn', type: 'url', repeatableGroup: 'social' },
      { key: 'tiktok-url', label: 'TikTok', type: 'url', repeatableGroup: 'social' },
      { key: 'x-url', label: 'X (Twitter)', type: 'url', repeatableGroup: 'social' },
    ],
  },

};

// Helper to get schema for a component type
export function getComponentSchema(type: string): ComponentSchema | undefined {
  return componentSchemas[type];
}

// Get all available component types for adding new components
export function getAvailableComponents(): ComponentSchema[] {
  return Object.values(componentSchemas);
}
