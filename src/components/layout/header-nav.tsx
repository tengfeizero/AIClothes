'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Box, Sparkles, ListChecks, Rotate3D, Image, WandSparkles } from 'lucide-react';

const navItems = [
  { href: '/generate', label: '自由创作', icon: Image },
  { href: '/edit', label: '精确编辑', icon: WandSparkles },
  { href: '/replicate', label: '爆款复刻', icon: Sparkles },
  { href: '/model3d', label: '3D商品', icon: Rotate3D },
  { href: '/tasks', label: '任务中心', icon: ListChecks },
  { href: '/assets', label: '素材中心', icon: Box },
];

export default function HeaderNav({ variant }: { variant: 'desktop' | 'mobile' }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  if (variant === 'mobile') {
    return (
      <div className="md:hidden border-t border-gray-100 overflow-x-auto">
        <div className="flex gap-1 px-4 py-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <nav className="hidden md:flex items-center gap-1">
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              active
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span className="hidden lg:inline">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
