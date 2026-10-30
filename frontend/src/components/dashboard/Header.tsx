"use client";

import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { LogOut, Menu, User as UserIcon } from "lucide-react";
import { SosButton } from "@/components/dashboard/sos/SosButton";
import { useAuthSession } from "@/lib/useAuthSession";
import { useSafeClerk } from "@/components/ClerkWrapper";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function DashboardHeader({
  onToggleSidebar,
}: {
  onToggleSidebar?: () => void;
}) {
  const { user: anonUser, loading, signOutAnonymous } = useAuthSession();
  const clerk = useSafeClerk();

  const clerkEmail = clerk?.user?.primaryEmailAddress?.emailAddress;

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-sm sm:px-6">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onToggleSidebar}
        aria-label="Open navigation"
        className="md:hidden"
      >
        <Menu />
      </Button>

      <div className="ml-auto flex items-center gap-2">
        <SosButton />
        {loading ? (
          <Skeleton className="h-8 w-8 rounded-full" />
        ) : clerk?.isSignedIn ? (
          <>
            <span className="hidden max-w-[200px] truncate text-sm text-muted-foreground sm:inline">
              {clerkEmail}
            </span>
            <UserButton />
          </>
        ) : anonUser ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="sm" className="gap-2 pl-1.5">
                  <Avatar size="sm">
                    <AvatarFallback>
                      <UserIcon className="size-3" />
                    </AvatarFallback>
                  </Avatar>
                  <span className="max-w-[140px] truncate">
                    {anonUser.username}
                  </span>
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="truncate text-sm font-medium">
                  {anonUser.username}
                </div>
                <div className="text-xs text-muted-foreground">
                  Anonymous session
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOutAnonymous} variant="destructive">
                <LogOut />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button
            size="sm"
            render={<Link href="/" />}
            nativeButton={false}
          >
            Sign in
          </Button>
        )}
      </div>
    </header>
  );
}
