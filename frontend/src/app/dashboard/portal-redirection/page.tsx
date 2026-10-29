"use client";

import { useMemo, useState } from "react";
import { Check, Copy, ExternalLink, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { PageHeader } from "@/components/dashboard/PageHeader";

interface CivicPortal {
  id: string;
  name: string;
  category: "National" | "State" | "Municipal";
  description: string;
  url: string;
  coverage: string;
}

const PORTALS: CivicPortal[] = [
  {
    id: "swachhata",
    name: "Swachhata Urban",
    category: "National",
    description:
      "Ministry of Housing & Urban Affairs complaint filing for garbage dumps, street sweeping, public toilets and sanitation.",
    url: "https://swachhbharaturban.gov.in/",
    coverage: "Urban local bodies across India",
  },
  {
    id: "cpgrams",
    name: "CPGRAMS",
    category: "National",
    description:
      "Centralised public grievance portal for escalating unresolved civic complaints to central ministries.",
    url: "https://pgportal.gov.in/",
    coverage: "Central ministries and departments",
  },
  {
    id: "mcd",
    name: "Municipal corporation directory",
    category: "Municipal",
    description:
      "Direct municipal ticketing: Delhi (MCD), Mumbai (BMC), Bengaluru (BBMP Sahaaya), Kolkata (KMC) and Chennai (GCC).",
    url: "https://mcdonline.nic.in/",
    coverage: "Metropolitan corporations",
  },
  {
    id: "state-cm",
    name: "State grievance cells",
    category: "State",
    description:
      "State helplines and grievance systems for escalating municipal inaction.",
    url: "https://services.india.gov.in/",
    coverage: "States and union territories",
  },
];

export default function PortalRedirectionPage() {
  const [query, setQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return PORTALS;

    return PORTALS.filter((portal) =>
      [portal.name, portal.description, portal.coverage, portal.category]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [query]);

  const copy = (portal: CivicPortal) => {
    navigator.clipboard.writeText(portal.url);
    setCopiedId(portal.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Government portals"
        description="Official grievance systems for filing or escalating a civic complaint outside CivicBridge."
      />

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter portals"
          aria-label="Filter portals"
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Search />
            </EmptyMedia>
            <EmptyTitle>No portals match</EmptyTitle>
            <EmptyDescription>
              Try a different name, authority or coverage area.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((portal) => (
            <Card key={portal.id} size="sm" className="justify-between">
              <CardHeader>
                <CardTitle>{portal.name}</CardTitle>
                <CardDescription>{portal.description}</CardDescription>
                <CardAction>
                  <Badge variant="secondary">{portal.category}</Badge>
                </CardAction>
              </CardHeader>

              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {portal.coverage}
                </p>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    render={
                      <a
                        href={portal.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      />
                    }
                    nativeButton={false}
                  >
                    Open portal
                    <ExternalLink />
                  </Button>

                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => copy(portal)}
                    aria-label={`Copy the ${portal.name} link`}
                  >
                    {copiedId === portal.id ? <Check /> : <Copy />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
