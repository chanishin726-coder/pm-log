import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getEffectiveUserId, AUTH_BYPASS } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { AppNav } from '@/components/AppNav';
import { LogOut } from 'lucide-react';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const userId = await getEffectiveUserId(supabase);

  if (!userId && !AUTH_BYPASS) {
    redirect('/login');
  }

  const signOut = async () => {
    'use server';
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect('/login');
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-background sticky top-0 z-40 safe-area-inset-top">
        <div className="container flex h-14 md:h-14 items-center justify-between px-3 sm:px-4 gap-2">
          <Link href="/" className="font-semibold text-lg shrink-0">
            PM Log
          </Link>
          <AppNav
            signOutNode={
              !AUTH_BYPASS ? (
                <form action={signOut}>
                  <Button type="submit" variant="ghost" size="icon" className="min-h-[44px] min-w-[44px] md:min-h-9 md:min-w-9">
                    <LogOut className="h-4 w-4" />
                  </Button>
                </form>
              ) : undefined
            }
          />
        </div>
      </header>
      <main className="flex-1 container px-3 sm:px-4 py-4 sm:py-6 pb-20 md:pb-6 safe-area-inset-bottom">
        {children}
      </main>
    </div>
  );
}
