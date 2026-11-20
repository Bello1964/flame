import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Reveals its content once, as it scrolls into view (see .flame-reveal in index.css).
 * Content is never hidden from assistive technology, and where IntersectionObserver is
 * unavailable, or motion is reduced, it is simply shown.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: 'div' | 'li' | 'section';
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    const node = ref.current;
    if (visible || !node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      // As soon as any part enters the viewport: a negative margin could strand content
      // near the end of the page, which can never scroll far enough up.
      { threshold: 0 },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [visible]);

  return (
    <Tag
      ref={(node: HTMLElement | null) => {
        ref.current = node;
      }}
      data-visible={visible}
      className={cn('flame-reveal', className)}
      style={{ transitionDelay: `${String(delay)}ms` }}
    >
      {children}
    </Tag>
  );
}
