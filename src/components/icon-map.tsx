import {
  PhotoIcon,
  ArrowsUpDownIcon,
  DocumentTextIcon,
  CursorArrowRaysIcon,
  TruckIcon,
  SparklesIcon,
  PaintBrushIcon,
  RectangleGroupIcon,
  MinusIcon,
  HashtagIcon,
  ChatBubbleLeftIcon,
  Bars3Icon,
  DocumentIcon,
} from '@heroicons/react/24/outline';

const iconMap: Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  PhotoIcon,
  ArrowsUpDownIcon,
  DocumentTextIcon,
  CursorArrowRaysIcon,
  TruckIcon,
  SparklesIcon,
  PaintBrushIcon,
  RectangleGroupIcon,
  MinusIcon,
  HashtagIcon,
  ChatBubbleLeftIcon,
  Bars3Icon,
  DocumentIcon,
};

export function SectionsIcon({ className = 'w-5 h-5', ...props }: React.SVGProps<SVGSVGElement> & { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} className={className} {...props}>
      <path d="M2.75 12h18.5M4 2.75V5.5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2.75M4 21.25V18.5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2.75" />
    </svg>
  );
}

export function FlowIcon({ className = 'w-5 h-5', ...props }: React.SVGProps<SVGSVGElement> & { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" fill="currentColor" className={className} {...props}>
      <path d="M9.8 18.8h16.4v3.08h1.6V17.2h-9V14h-1.6v3.2h-9v4.68h1.6V18.8z" />
      <path d="M14 23H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2ZM4 31v-6h10v6Z" />
      <path d="M32 23H22a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2Zm-10 8v-6h10v6Z" />
      <path d="M13 13h10a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H13a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2Zm0-8h10v6H13Z" />
    </svg>
  );
}

export function ComponentIcon({ name, className = 'w-5 h-5' }: { name: string; className?: string }) {
  const Icon = iconMap[name];
  if (!Icon) return <span className={className}>?</span>;
  return <Icon className={className} />;
}

export default iconMap;
