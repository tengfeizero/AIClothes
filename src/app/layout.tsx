import type { Metadata } from 'next';
import Link from 'next/link';
import { Shirt } from 'lucide-react';
import HeaderNav from '@/components/layout/header-nav';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Clothes - 智能穿搭平台',
  description: 'AI换装、定制模特、3D展示、爆款复刻、商品套图、穿搭方案',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <Link href="/" className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <Shirt className="w-5 h-5 text-white" />
                </div>
                <span className="text-xl font-bold text-gray-900">AI Clothes</span>
              </Link>
              <HeaderNav variant="desktop" />
            </div>
          </div>
          <HeaderNav variant="mobile" />
        </header>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
