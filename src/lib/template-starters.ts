/**
 * Default starter templates for new email template creation.
 *
 * Visual (Drag & Drop): Rich multi-component Maizzle template
 * Code (HTML): Clean, simpler Maizzle template for direct editing
 */

/** Rich component-based starter for visual (Drag & Drop) mode */
function visualStarter(title: string) {
  return `---
title: ${title}
rooftop: preview
---

<x-base>

  <x-core.header />

  <x-core.hero
    headline="Your Headline Goes Here"
    subheadline="Add a brief description that captures your audience's attention and encourages them to keep reading."
    fallback-bg="#1a1a2e"
    headline-color="#ffffff"
    subheadline-color="#e0e0e0"
    hero-height="420px"
    text-align="center"
    content-valign="middle"
    primary-button-text="Get Started"
    primary-button-url="#"
    primary-button-bg-color="#4f46e5"
    primary-button-text-color="#ffffff"
    primary-button-radius="8px"
  />

  <x-core.spacer size="40" />

  <x-core.copy
    greeting="Hi {{contact.first_name}},"
    body="Thank you for being a valued member of our community. We're excited to share some updates with you."
    align="center"
    padding="20px 40px"
  />

  <x-core.spacer size="24" />

  <x-core.features
    section-title="What We Offer"
    feature1="Quality Service"
    feature1-desc="We pride ourselves on delivering exceptional quality in everything we do."
    feature2="Expert Team"
    feature2-desc="Our experienced team is here to help you achieve your goals."
    feature3="Fast Results"
    feature3-desc="Get the results you need quickly and efficiently."
    variant="icon"
    accent-color="#4f46e5"
    padding="20px 40px"
  />

  <x-core.spacer size="24" />

  <x-core.cta
    button-text="Learn More"
    button-url="#"
    button-bg-color="#4f46e5"
    button-text-color="#ffffff"
    button-radius="8px"
    section-padding="20px 40px"
    align="center"
  />

  <x-core.spacer size="40" />

  <x-core.footer />

</x-base>
`;
}

/** Clean starter for code (HTML) editing mode */
function codeStarter(title: string) {
  return `---
title: ${title}
rooftop: preview
---

<x-base>

  <x-core.header />

  <x-core.spacer size="24" />

  <x-core.copy
    greeting="Hi {{contact.first_name}},"
    body="Thank you for being part of our community. We wanted to reach out with an important update."
    align="left"
    padding="20px 40px"
  />

  <x-core.divider
    color="#e5e7eb"
    padding="0 40px"
  />

  <x-core.copy
    body="Add the main content of your email here. You can use multiple copy blocks, images, buttons, and other components to build your message."
    align="left"
    padding="20px 40px"
  />

  <x-core.cta
    button-text="Take Action"
    button-url="#"
    button-bg-color="#4f46e5"
    button-text-color="#ffffff"
    button-radius="8px"
    section-padding="20px 40px"
    align="center"
  />

  <x-core.spacer size="24" />

  <x-core.footer />

</x-base>
`;
}

/**
 * Get the appropriate starter template for the given editor mode.
 */
export function getStarterTemplate(mode: 'visual' | 'code', title = 'Untitled Template'): string {
  return mode === 'code' ? codeStarter(title) : visualStarter(title);
}
