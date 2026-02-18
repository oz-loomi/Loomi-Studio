export type FieldType = 'text' | 'textarea' | 'color' | 'url' | 'select' | 'toggle' | 'number' | 'padding' | 'radius';

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

export const componentSchemas: Record<string, ComponentSchema> = {
  hero: {
    name: 'hero',
    label: 'Hero Banner',
    icon: 'PhotoIcon',
    props: [
      { key: 'eyebrow', label: 'Eyebrow', type: 'text' },
      { key: 'headline', label: 'Headline', type: 'text', required: true },
      { key: 'subheadline', label: 'Subheadline', type: 'textarea' },
      { key: 'primary-button-text', label: 'Button Text', type: 'text', half: true },
      { key: 'primary-button-url', label: 'Button URL', type: 'url', half: true },
      { key: 'secondary-button-text', label: 'Secondary Button', type: 'text', half: true },
      { key: 'secondary-button-url', label: 'Secondary URL', type: 'url', half: true },
      { key: 'bg-image', label: 'Background Image', type: 'url' },
      { key: 'hero-height', label: 'Height', type: 'text', default: '500px', half: true },
      { key: 'fallback-bg', label: 'Fallback Color', type: 'color', half: true },
      { key: 'gradient', label: 'Gradient Overlay', type: 'text' },
      { key: 'text-align', label: 'Text Align', type: 'select', half: true, options: [
        { label: 'Left', value: 'left' }, { label: 'Center', value: 'center' }, { label: 'Right', value: 'right' },
      ]},
      { key: 'content-valign', label: 'Vertical Align', type: 'select', half: true, options: [
        { label: 'Top', value: 'top' }, { label: 'Middle', value: 'middle' }, { label: 'Bottom', value: 'bottom' },
      ]},
      { key: 'content-padding', label: 'Content Padding', type: 'padding', default: '48px' },
      { key: 'primary-bg-color', label: 'Button BG', type: 'color', half: true },
      { key: 'primary-text-color', label: 'Button Text', type: 'color', half: true },
      { key: 'primary-radius', label: 'Button Radius', type: 'text', half: true },
      { key: 'utm-campaign', label: 'UTM Campaign', type: 'text', half: true },
      { key: 'eyebrow-size', label: 'Eyebrow Size', type: 'text', half: true },
      { key: 'eyebrow-color', label: 'Eyebrow Color', type: 'color', half: true },
      { key: 'headline-size', label: 'Headline Size', type: 'text', half: true },
      { key: 'headline-color', label: 'Headline Color', type: 'color', half: true },
      { key: 'subheadline-size', label: 'Sub Size', type: 'text', half: true },
      { key: 'subheadline-color', label: 'Sub Color', type: 'color', half: true },
      { key: 'border-color', label: 'Border Color', type: 'color', half: true },
      { key: 'border-width', label: 'Border Width', type: 'text', half: true, default: '0px' },
      { key: 'border-style', label: 'Border Style', type: 'select', half: true, options: [
        { label: 'None', value: 'none' }, { label: 'Solid', value: 'solid' }, { label: 'Dashed', value: 'dashed' }, { label: 'Dotted', value: 'dotted' },
      ]},
    ],
  },

  spacer: {
    name: 'spacer',
    label: 'Spacer',
    icon: 'ArrowsUpDownIcon',
    props: [
      { key: 'size', label: 'Height (px)', type: 'number', default: '48' },
      { key: 'bg-color', label: 'Background', type: 'color' },
    ],
  },

  copy: {
    name: 'copy',
    label: 'Copy Block',
    icon: 'DocumentTextIcon',
    props: [
      { key: 'greeting', label: 'Greeting', type: 'text' },
      { key: 'body', label: 'Body Text', type: 'textarea', required: true },
      { key: 'align', label: 'Alignment', type: 'select', half: true, options: [
        { label: 'Left', value: 'left' }, { label: 'Center', value: 'center' }, { label: 'Right', value: 'right' },
      ]},
      { key: 'line-height', label: 'Line Height', type: 'text', half: true },
      { key: 'padding', label: 'Padding', type: 'padding' },
      { key: 'greeting-size', label: 'Greeting Size', type: 'text', half: true },
      { key: 'greeting-color', label: 'Greeting Color', type: 'color', half: true },
      { key: 'body-size', label: 'Body Size', type: 'text', half: true },
      { key: 'body-color', label: 'Body Color', type: 'color', half: true },
      { key: 'border-color', label: 'Border Color', type: 'color', half: true },
      { key: 'border-width', label: 'Border Width', type: 'text', half: true, default: '0px' },
      { key: 'border-style', label: 'Border Style', type: 'select', half: true, options: [
        { label: 'None', value: 'none' }, { label: 'Solid', value: 'solid' }, { label: 'Dashed', value: 'dashed' }, { label: 'Dotted', value: 'dotted' },
      ]},
    ],
  },

  cta: {
    name: 'cta',
    label: 'Call to Action',
    icon: 'CursorArrowRaysIcon',
    props: [
      { key: 'button-text', label: 'Button Text', type: 'text', required: true, default: 'Schedule Service' },
      { key: 'button-url', label: 'Button URL', type: 'url' },
      { key: 'phone-text', label: 'Phone Text', type: 'text', half: true },
      { key: 'show-phone', label: 'Show Phone', type: 'toggle', half: true, default: 'true' },
      { key: 'align', label: 'Alignment', type: 'select', half: true, options: [
        { label: 'Left', value: 'left' }, { label: 'Center', value: 'center' }, { label: 'Right', value: 'right' },
      ]},
      { key: 'border', label: 'Border', type: 'text', half: true },
      { key: 'bg-color', label: 'Button BG', type: 'color', half: true },
      { key: 'text-color', label: 'Button Text', type: 'color', half: true },
      { key: 'radius', label: 'Border Radius', type: 'radius' },
      { key: 'padding', label: 'Button Padding', type: 'padding' },
      { key: 'phone-color', label: 'Phone Color', type: 'color', half: true },
      { key: 'phone-link-color', label: 'Phone Link', type: 'color', half: true },
      { key: 'utm-source', label: 'UTM Source', type: 'text', half: true, default: 'email' },
      { key: 'utm-medium', label: 'UTM Medium', type: 'text', half: true, default: 'lifecycle' },
      { key: 'utm-campaign', label: 'UTM Campaign', type: 'text' },
      { key: 'section-border-color', label: 'Border Color', type: 'color', half: true },
      { key: 'section-border-width', label: 'Border Width', type: 'text', half: true, default: '0px' },
      { key: 'section-border-style', label: 'Border Style', type: 'select', half: true, options: [
        { label: 'None', value: 'none' }, { label: 'Solid', value: 'solid' }, { label: 'Dashed', value: 'dashed' }, { label: 'Dotted', value: 'dotted' },
      ]},
    ],
  },

  'vehicle-card': {
    name: 'vehicle-card',
    label: 'Vehicle Card',
    icon: 'TruckIcon',
    repeatableGroups: [
      {
        key: 'stat',
        label: 'Stat',
        maxItems: 2,
        propsPerItem: ['stat-{n}-label', 'stat-{n}-value'],
      },
    ],
    props: [
      { key: 'card-label', label: 'Card Label', type: 'text', default: 'Your Vehicle' },
      { key: 'vehicle-year', label: 'Year', type: 'text', half: true, default: '{{contact.vehicle_year}}' },
      { key: 'vehicle-make', label: 'Make', type: 'text', half: true, default: '{{contact.vehicle_make}}' },
      { key: 'vehicle-model', label: 'Model', type: 'text', half: true, default: '{{contact.vehicle_model}}' },
      { key: 'show-stats', label: 'Show Stats', type: 'toggle', half: true, default: 'true' },
      { key: 'stat-1-label', label: 'Label', type: 'text', half: true, repeatableGroup: 'stat' },
      { key: 'stat-1-value', label: 'Value', type: 'text', half: true, repeatableGroup: 'stat' },
      { key: 'stat-2-label', label: 'Label', type: 'text', half: true, repeatableGroup: 'stat' },
      { key: 'stat-2-value', label: 'Value', type: 'text', half: true, repeatableGroup: 'stat' },
      { key: 'bg-color', label: 'Background', type: 'color', half: true },
      { key: 'accent-color', label: 'Accent', type: 'color', half: true },
      { key: 'label-color', label: 'Label Color', type: 'color', half: true },
      { key: 'vehicle-color', label: 'Vehicle Color', type: 'color', half: true },
      { key: 'stat-label-color', label: 'Stat Label', type: 'color', half: true },
      { key: 'stat-value-color', label: 'Stat Value', type: 'color', half: true },
      { key: 'border-color', label: 'Border Color', type: 'color', half: true },
      { key: 'border-width', label: 'Border Width', type: 'text', half: true, default: '1px' },
      { key: 'border-style', label: 'Border Style', type: 'select', half: true, options: [
        { label: 'None', value: 'none' }, { label: 'Solid', value: 'solid' }, { label: 'Dashed', value: 'dashed' }, { label: 'Dotted', value: 'dotted' },
      ]},
      { key: 'radius', label: 'Radius', type: 'radius' },
    ],
  },

  features: {
    name: 'features',
    label: 'Features Grid',
    icon: 'SparklesIcon',
    repeatableGroups: [
      {
        key: 'feature',
        label: 'Feature',
        maxItems: 4,
        propsPerItem: ['feature{n}', 'feature{n}-desc', 'feature{n}-icon', 'feature{n}-image'],
      },
    ],
    props: [
      { key: 'section-title', label: 'Section Title', type: 'text' },
      { key: 'variant', label: 'Variant', type: 'select', options: [
        { label: 'Icon', value: 'icon' }, { label: 'Image', value: 'image' },
      ]},
      { key: 'feature1', label: 'Title', type: 'text', repeatableGroup: 'feature' },
      { key: 'feature1-desc', label: 'Description', type: 'textarea', repeatableGroup: 'feature' },
      { key: 'feature1-icon', label: 'Icon URL', type: 'url', half: true, repeatableGroup: 'feature' },
      { key: 'feature1-image', label: 'Image URL', type: 'url', half: true, repeatableGroup: 'feature' },
      { key: 'feature2', label: 'Title', type: 'text', repeatableGroup: 'feature' },
      { key: 'feature2-desc', label: 'Description', type: 'textarea', repeatableGroup: 'feature' },
      { key: 'feature2-icon', label: 'Icon URL', type: 'url', half: true, repeatableGroup: 'feature' },
      { key: 'feature2-image', label: 'Image URL', type: 'url', half: true, repeatableGroup: 'feature' },
      { key: 'feature3', label: 'Title', type: 'text', repeatableGroup: 'feature' },
      { key: 'feature3-desc', label: 'Description', type: 'textarea', repeatableGroup: 'feature' },
      { key: 'feature3-icon', label: 'Icon URL', type: 'url', half: true, repeatableGroup: 'feature' },
      { key: 'feature3-image', label: 'Image URL', type: 'url', half: true, repeatableGroup: 'feature' },
      { key: 'feature4', label: 'Title', type: 'text', repeatableGroup: 'feature' },
      { key: 'feature4-desc', label: 'Description', type: 'textarea', repeatableGroup: 'feature' },
      { key: 'feature4-icon', label: 'Icon URL', type: 'url', half: true, repeatableGroup: 'feature' },
      { key: 'feature4-image', label: 'Image URL', type: 'url', half: true, repeatableGroup: 'feature' },
      { key: 'bg-color', label: 'Background', type: 'color', half: true },
      { key: 'card-bg-color', label: 'Card BG', type: 'color', half: true },
      { key: 'title-color', label: 'Title Color', type: 'color', half: true },
      { key: 'text-color', label: 'Text Color', type: 'color', half: true },
      { key: 'accent-color', label: 'Accent Color', type: 'color', half: true },
      { key: 'card-radius', label: 'Card Radius', type: 'radius' },
      { key: 'border-color', label: 'Border Color', type: 'color', half: true },
      { key: 'border-width', label: 'Border Width', type: 'text', half: true, default: '0px' },
      { key: 'border-style', label: 'Border Style', type: 'select', half: true, options: [
        { label: 'None', value: 'none' }, { label: 'Solid', value: 'solid' }, { label: 'Dashed', value: 'dashed' }, { label: 'Dotted', value: 'dotted' },
      ]},
    ],
  },

  image: {
    name: 'image',
    label: 'Image',
    icon: 'PhotoIcon',
    props: [
      { key: 'image', label: 'Image URL', type: 'url', required: true },
      { key: 'alt', label: 'Alt Text', type: 'text' },
      { key: 'width', label: 'Width', type: 'number', half: true, default: '600' },
      { key: 'max-height', label: 'Max Height', type: 'text', half: true },
      { key: 'radius', label: 'Radius', type: 'radius' },
      { key: 'padding', label: 'Padding', type: 'padding' },
      { key: 'border-color', label: 'Border Color', type: 'color', half: true },
      { key: 'border-width', label: 'Border Width', type: 'text', half: true, default: '0px' },
      { key: 'border-style', label: 'Border Style', type: 'select', half: true, options: [
        { label: 'None', value: 'none' }, { label: 'Solid', value: 'solid' }, { label: 'Dashed', value: 'dashed' }, { label: 'Dotted', value: 'dotted' },
      ]},
    ],
  },

  'image-overlay': {
    name: 'image-overlay',
    label: 'Image Overlay',
    icon: 'PaintBrushIcon',
    props: [
      { key: 'image', label: 'Background Image', type: 'url', required: true },
      { key: 'heading', label: 'Heading', type: 'text' },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'button-text', label: 'Button Text', type: 'text', half: true },
      { key: 'button-url', label: 'Button URL', type: 'url', half: true },
      { key: 'overlay', label: 'Overlay Preset', type: 'select', half: true, options: [
        { label: 'Light', value: 'light' }, { label: 'Medium', value: 'medium' },
        { label: 'Dark', value: 'dark' }, { label: 'Heavy', value: 'heavy' },
      ]},
      { key: 'align', label: 'Alignment', type: 'select', half: true, options: [
        { label: 'Left', value: 'left' }, { label: 'Center', value: 'center' }, { label: 'Right', value: 'right' },
      ]},
      { key: 'content-padding', label: 'Content Padding', type: 'padding' },
      { key: 'heading-size', label: 'Heading Size', type: 'text', half: true },
      { key: 'heading-color', label: 'Heading Color', type: 'color', half: true },
      { key: 'button-bg-color', label: 'Button BG', type: 'color', half: true },
      { key: 'button-text-color', label: 'Button Text', type: 'color', half: true },
      { key: 'button-radius', label: 'Button Radius', type: 'radius' },
      { key: 'utm-campaign', label: 'UTM Campaign', type: 'text' },
      { key: 'border-color', label: 'Border Color', type: 'color', half: true },
      { key: 'border-width', label: 'Border Width', type: 'text', half: true, default: '0px' },
      { key: 'border-style', label: 'Border Style', type: 'select', half: true, options: [
        { label: 'None', value: 'none' }, { label: 'Solid', value: 'solid' }, { label: 'Dashed', value: 'dashed' }, { label: 'Dotted', value: 'dotted' },
      ]},
    ],
  },

  'image-card-overlay': {
    name: 'image-card-overlay',
    label: 'Image Card Overlay',
    icon: 'RectangleGroupIcon',
    props: [
      { key: 'background-image', label: 'Background Image', type: 'url', required: true },
      { key: 'eyebrow', label: 'Eyebrow', type: 'text' },
      { key: 'headline', label: 'Headline', type: 'text' },
      { key: 'body', label: 'Body', type: 'textarea' },
      { key: 'cta-text', label: 'CTA Text', type: 'text', half: true },
      { key: 'cta-url', label: 'CTA URL', type: 'url', half: true },
      { key: 'card-align', label: 'Card Align', type: 'select', half: true, options: [
        { label: 'Left', value: 'left' }, { label: 'Center', value: 'center' }, { label: 'Right', value: 'right' },
      ]},
      { key: 'card-max-width', label: 'Card Max Width', type: 'text', half: true },
      { key: 'card-padding', label: 'Card Padding', type: 'padding' },
      { key: 'card-radius', label: 'Card Radius', type: 'radius' },
      { key: 'card-background', label: 'Card BG', type: 'color', half: true },
      { key: 'eyebrow-color', label: 'Eyebrow Color', type: 'color', half: true },
      { key: 'headline-color', label: 'Headline Color', type: 'color', half: true },
      { key: 'body-color', label: 'Body Color', type: 'color', half: true },
      { key: 'cta-color', label: 'CTA Color', type: 'color' },
      { key: 'border-color', label: 'Border Color', type: 'color', half: true },
      { key: 'border-width', label: 'Border Width', type: 'text', half: true, default: '0px' },
      { key: 'border-style', label: 'Border Style', type: 'select', half: true, options: [
        { label: 'None', value: 'none' }, { label: 'Solid', value: 'solid' }, { label: 'Dashed', value: 'dashed' }, { label: 'Dotted', value: 'dotted' },
      ]},
    ],
  },

  divider: {
    name: 'divider',
    label: 'Divider',
    icon: 'MinusIcon',
    props: [
      { key: 'color', label: 'Color', type: 'color' },
      { key: 'thickness', label: 'Thickness', type: 'text', half: true, default: '1px' },
      { key: 'style', label: 'Style', type: 'select', half: true, options: [
        { label: 'Solid', value: 'solid' }, { label: 'Dashed', value: 'dashed' }, { label: 'Dotted', value: 'dotted' },
      ]},
      { key: 'padding', label: 'Padding', type: 'padding' },
      { key: 'margin', label: 'Margin', type: 'padding' },
    ],
  },

  'countdown-stat': {
    name: 'countdown-stat',
    label: 'Countdown Stat',
    icon: 'HashtagIcon',
    props: [
      { key: 'label', label: 'Label', type: 'text', half: true },
      { key: 'value', label: 'Value', type: 'text', half: true, required: true },
      { key: 'caption', label: 'Caption', type: 'text' },
      { key: 'align', label: 'Alignment', type: 'select', options: [
        { label: 'Left', value: 'left' }, { label: 'Center', value: 'center' }, { label: 'Right', value: 'right' },
      ]},
      { key: 'bg-color', label: 'Background', type: 'color', half: true },
      { key: 'value-color', label: 'Value Color', type: 'color', half: true },
      { key: 'label-color', label: 'Label Color', type: 'color', half: true },
      { key: 'caption-color', label: 'Caption Color', type: 'color', half: true },
      { key: 'radius', label: 'Radius', type: 'radius' },
      { key: 'padding', label: 'Padding', type: 'padding' },
      { key: 'border-color', label: 'Border Color', type: 'color', half: true },
      { key: 'border-width', label: 'Border Width', type: 'text', half: true, default: '0px' },
      { key: 'border-style', label: 'Border Style', type: 'select', half: true, options: [
        { label: 'None', value: 'none' }, { label: 'Solid', value: 'solid' }, { label: 'Dashed', value: 'dashed' }, { label: 'Dotted', value: 'dotted' },
      ]},
    ],
  },

  testimonial: {
    name: 'testimonial',
    label: 'Testimonial',
    icon: 'ChatBubbleLeftIcon',
    props: [
      { key: 'quote', label: 'Quote', type: 'textarea', required: true },
      { key: 'author', label: 'Author', type: 'text', half: true },
      { key: 'source', label: 'Source', type: 'text', half: true },
      { key: 'align', label: 'Alignment', type: 'select', options: [
        { label: 'Left', value: 'left' }, { label: 'Center', value: 'center' }, { label: 'Right', value: 'right' },
      ]},
      { key: 'bg-color', label: 'Background', type: 'color', half: true },
      { key: 'accent-color', label: 'Accent', type: 'color', half: true },
      { key: 'quote-color', label: 'Quote Color', type: 'color', half: true },
      { key: 'author-color', label: 'Author Color', type: 'color', half: true },
      { key: 'source-color', label: 'Source Color', type: 'color' },
      { key: 'radius', label: 'Radius', type: 'radius' },
      { key: 'padding', label: 'Padding', type: 'padding' },
      { key: 'border-color', label: 'Border Color', type: 'color', half: true },
      { key: 'border-width', label: 'Border Width', type: 'text', half: true, default: '0.5px' },
      { key: 'border-style', label: 'Border Style', type: 'select', half: true, options: [
        { label: 'None', value: 'none' }, { label: 'Solid', value: 'solid' }, { label: 'Dashed', value: 'dashed' }, { label: 'Dotted', value: 'dotted' },
      ]},
    ],
  },

  header: {
    name: 'header',
    label: 'Header',
    icon: 'Bars3Icon',
    props: [
      { key: 'logo-url', label: 'Logo URL', type: 'url' },
      { key: 'logo-alt', label: 'Logo Alt', type: 'text' },
      { key: 'link-url', label: 'Link URL', type: 'url' },
      { key: 'bg-color', label: 'Background', type: 'color' },
      { key: 'align', label: 'Alignment', type: 'select', half: true, options: [
        { label: 'Left', value: 'left' }, { label: 'Center', value: 'center' }, { label: 'Right', value: 'right' },
      ]},
      { key: 'logo-width', label: 'Logo Width', type: 'number', half: true },
      { key: 'padding', label: 'Padding', type: 'padding' },
    ],
  },

  footer: {
    name: 'footer',
    label: 'Footer',
    icon: 'DocumentIcon',
    repeatableGroups: [
      {
        key: 'social',
        label: 'Social Link',
        maxItems: 6,
        propsPerItem: ['facebook-url', 'instagram-url', 'youtube-url', 'linkedin-url', 'tiktok-url', 'x-url'],
      },
    ],
    props: [
      { key: 'variant', label: 'Style', type: 'select', options: [
        { label: 'Dealer', value: 'dealer' }, { label: 'Brand', value: 'brand' },
      ]},
      { key: 'dealer-name', label: 'Business Name', type: 'text' },
      { key: 'logo-url', label: 'Logo URL', type: 'url' },
      { key: 'logo-width', label: 'Logo Width', type: 'number', half: true },
      { key: 'bg-color', label: 'Background', type: 'color', half: true },
      { key: 'text-color', label: 'Text Color', type: 'color', half: true },
      { key: 'dealer-name-color', label: 'Name Color', type: 'color', half: true },
      { key: 'link-color', label: 'Link Color', type: 'color', half: true },
      { key: 'divider-color', label: 'Divider Color', type: 'color', half: true },
      { key: 'phone-color', label: 'Phone Color', type: 'color', half: true },
      { key: 'icon-color', label: 'Icon Color', type: 'color', half: true },
      { key: 'copyright-color', label: 'Copyright Color', type: 'color', half: true },
      { key: 'container-padding', label: 'Padding', type: 'padding' },
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
