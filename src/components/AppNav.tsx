'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Menu, X, LayoutDashboard, FileText, CheckSquare, FolderOpen, FileCheck, Search } from 'lucide-react';

const nav = [
  { href: '/', label: '대시보드', icon: LayoutDashboard },
  { href: '/logs', label: '로그', icon: FileText },
  { href: '/tasks', label: '할일', icon: CheckSquare },
  { href: '/projects', label: '프로젝트', icon: FolderOpen },
  { href: '/reports/daily', label: '일지', icon: FileCheck },
  { href: '/reports/executive', label: '임원보고', icon: FileCheck },
  { href: '/query', label: '질의', icon: Search },
];

const touchClass = 'min-h-[44px] min-w-[44px] flex items-center justify-center';

export function AppNav({ signOutNode }: { signOutNode?: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* 데스크톱: 가로 네비 */}
      <nav className="hidden md:flex items-center gap-1">
        {nav.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href}>
            <Button
              variant={pathname === href || (href !== '/' && pathname.startsWith(href)) ? 'secondary' : 'ghost'}
              size="sm"
              className={`gap-1.5 ${touchClass} md:min-h-0 md:min-w-0 md:py-2`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="hidden lg:inline">{label}</span>
            </Button>
          </Link>
        ))}
        {signOutNode}
      </nav>

      {/* 모바일: 햄버거 + 드로어 */}
      <div className="flex items-center gap-1 md:hidden">
        <Button
          variant="ghost"
          size="icon"
          className={touchClass}
          onClick={() => setOpen(true)}
          aria-label="메뉴 열기"
        >
          <Menu className="h-5 w-5" />
        </Button>
        {signOutNode}
      </div>

      {/* 모바일 드로어 오버레이 */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/50 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* 모바일 드로어 패널 */}
      <div
        className={`fixed top-0 left-0 z-50 h-full w-[min(280px,85vw)] bg-background border-r shadow-xl transition-transform duration-200 ease-out md:hidden safe-area-inset-top ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b pt-[max(1rem,env(safe-area-inset-top))]">
          <span className="font-semibold">PM Log</span>
          <Button variant="ghost" size="icon" className={touchClass} onClick={() => setOpen(false)} aria-label="메뉴 닫기">
            <X className="h-5 w-5" />
          </Button>
        </div>
        <ul className="py-2">
          {nav.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 text-left hover:bg-muted ${touchClass} min-h-[48px] ${
                  pathname === href || (href !== '/' && pathname.startsWith(href)) ? 'bg-muted font-medium' : ''
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span>{label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
