"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  LayoutDashboard,
  Newspaper,
  Radio,
  ScrollText,
  TrafficCone,
  Trash2,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const NAV: Array<{
  group?: string;
  items: Array<{
    label: string;
    href: string;
    icon: React.ElementType;
    exact?: boolean;
  }>;
}> = [
  {
    items: [
      {
        label: "Overview",
        href: "/dashboard",
        icon: LayoutDashboard,
        exact: true,
      },
    ],
  },
  {
    group: "Report an issue",
    items: [
      { label: "Garbage", href: "/dashboard/garbage-reporting", icon: Trash2 },
      { label: "Pothole", href: "/dashboard/pothole-reporting", icon: TrafficCone },
    ],
  },
  {
    items: [
      { label: "Public feed", href: "/dashboard/public-feed", icon: Radio },
      { label: "My reports", href: "/dashboard/reports", icon: ScrollText },
      { label: "Civic news", href: "/dashboard/news", icon: Newspaper },
    ],
  },
];

function isActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname.startsWith(href);
}

function Brand() {
  return (
    <Link
      href="/dashboard"
      className="flex h-14 items-center gap-2.5 px-5 text-sm font-semibold tracking-tight"
    >
      <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Building2 className="size-4" />
      </span>
      CivicBridge
    </Link>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-4 px-3 py-2">
      {NAV.map((section, index) => (
        <div key={section.group ?? index} className="flex flex-col gap-0.5">
          {section.group && (
            <div className="px-2.5 pb-1 text-xs font-medium text-muted-foreground">
              {section.group}
            </div>
          )}

          {section.items.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href, item.exact);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                  active
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="size-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function DashboardSidebar({
  isOpen,
  onClose,
}: {
  isOpen?: boolean;
  onClose?: () => void;
}) {
  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-sidebar md:flex">
        <Brand />
        <NavLinks />
      </aside>

      <Sheet open={Boolean(isOpen)} onOpenChange={(open) => !open && onClose?.()}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">
            CivicBridge dashboard sections
          </SheetDescription>
          <Brand />
          <NavLinks onNavigate={onClose} />
        </SheetContent>
      </Sheet>
    </>
  );
}
