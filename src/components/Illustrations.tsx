import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

export function HeartIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M20.3 5.9a5.1 5.1 0 0 0-7.2 0l-1.1 1.2-1.1-1.2a5.1 5.1 0 0 0-7.2 7.2l1.2 1.1L12 22l7.1-7.8 1.2-1.1a5.1 5.1 0 0 0 0-7.2Z" fill="currentColor" />
    </svg>
  );
}

export function FlowerMark(props: IconProps) {
  return (
    <svg viewBox="0 0 44 44" fill="none" aria-hidden="true" {...props}>
      <path d="M22 15.2c-4.5-8.3 4-11.5 5.7-6.1 1.4 4.4-2.7 7.8-5.7 6.1Z" fill="#D59AA2" />
      <path d="M28.3 19.1c8.3-4.5 11.5 4 6.1 5.7-4.4 1.4-7.8-2.7-6.1-5.7Z" fill="#E6B9A7" />
      <path d="M24.5 25.4c4.5 8.3-4 11.5-5.7 6.1-1.4-4.4 2.7-7.8 5.7-6.1Z" fill="#D59AA2" />
      <path d="M18.2 21.6c-8.3 4.5-11.5-4-6.1-5.7 4.4-1.4 7.8 2.7 6.1 5.7Z" fill="#E6B9A7" />
      <circle cx="22.1" cy="21.9" r="4.3" fill="#F4D99B" />
      <path d="M22 29.8v9" stroke="#82947B" strokeWidth="2" strokeLinecap="round" />
      <path d="M22 35.2c-4.4-4-7.7-.4-4 2.1 2.2 1.5 3.8-.2 4-2.1Z" fill="#A9B99D" />
    </svg>
  );
}

export function EnvelopeIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 48 38" fill="none" aria-hidden="true" {...props}>
      <rect x="2" y="3" width="44" height="32" rx="5" fill="#F8E9DC" stroke="#D8BFB1" strokeWidth="1.5" />
      <path d="m4 7 20 15L44 7" stroke="#C98291" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m4 32 14-12M44 32 30 20" stroke="#E3C8BA" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M24 15.2c-2.1-3.8 1.8-5.3 2.6-2.8.7 2-1.2 3.6-2.6 2.8Z" fill="#C98291" />
      <path d="M27 17c3.8-2.1 5.3 1.8 2.8 2.6-2 .7-3.6-1.2-2.8-2.6Z" fill="#C98291" />
      <path d="M25.2 20c2.1 3.8-1.8 5.3-2.6 2.8-.7-2 1.2-3.6 2.6-2.8Z" fill="#C98291" />
      <path d="M22.2 18.2c-3.8 2.1-5.3-1.8-2.8-2.6 2-.7 3.6 1.2 2.8 2.6Z" fill="#C98291" />
      <circle cx="24.6" cy="18.2" r="1.5" fill="#F6D99B" />
    </svg>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <rect x="4.5" y="10" width="15" height="11" rx="3" fill="currentColor" opacity=".16" />
      <path d="M7.5 10V7a4.5 4.5 0 0 1 9 0v3M12 14.5v2.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="4.5" y="10" width="15" height="11" rx="3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M4 12h15M13 5l7 7-7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SparkleIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M12 2.5c.8 4.8 3 7 7.5 8.1-4.5 1.1-6.7 3.3-7.5 8.1-.8-4.8-3-7-7.5-8.1C9 9.5 11.2 7.3 12 2.5Z" fill="currentColor" />
      <path d="M19.5 16.5c.3 1.7 1.1 2.5 2.5 2.9-1.4.4-2.2 1.2-2.5 2.9-.3-1.7-1.1-2.5-2.5-2.9 1.4-.4 2.2-1.2 2.5-2.9Z" fill="currentColor" />
    </svg>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M8 5.7c0-.8.9-1.3 1.6-.9l9.1 5.3a1.1 1.1 0 0 1 0 1.9l-9.1 5.3a1.1 1.1 0 0 1-1.6-.9V5.7Z" fill="currentColor" />
    </svg>
  );
}
