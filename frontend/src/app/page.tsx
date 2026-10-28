"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SignIn } from "@clerk/nextjs";
import { ArrowRight, Building2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const HANDLE_PREFIXES = [
  "Citizen",
  "EcoWatcher",
  "UrbanHero",
  "CivicGuard",
  "MetroObserver",
];

export default function HomePage() {
  const router = useRouter();
  const [tab, setTab] = useState("anonymous");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const isClerkConfigured = Boolean(
    publishableKey &&
      publishableKey.startsWith("pk_") &&
      !publishableKey.includes("placeholder")
  );

  const generateHandle = () => {
    const prefix =
      HANDLE_PREFIXES[Math.floor(Math.random() * HANDLE_PREFIXES.length)];
    setUsername(`${prefix}_${Math.floor(1000 + Math.random() * 9000)}`);
    setErrorMessage("");
  };

  const handleAnonymousSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    const cleanUsername = username.trim();
    if (cleanUsername.length < 3 || cleanUsername.length > 30) {
      setErrorMessage("Pick a handle between 3 and 30 characters.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/anonymous", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: cleanUsername }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.error || "Could not start an anonymous session.");
        setLoading(false);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      console.error("Anonymous authentication error:", err);
      setErrorMessage("Network error. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-16 items-center border-b px-6 lg:px-10">
        <span className="flex items-center gap-2.5 font-semibold tracking-tight">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Building2 className="size-4" />
          </span>
          CivicBridge
        </span>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-6 py-16 lg:grid-cols-2 lg:gap-16 lg:px-10">
        <div className="space-y-8">
          <div className="space-y-4">
            <h1 className="font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Civic issues, scored and routed automatically.
            </h1>
            <p className="max-w-xl text-lg text-muted-foreground">
              Photograph a waste dump and submit it. CivicBridge classifies the
              material, scores how urgent it is against nearby hospitals and
              schools, and sends a formal notice to the responsible municipal
              authority.
            </p>
          </div>

          <dl className="grid gap-6 sm:grid-cols-2">
            <Feature
              title="Automated assessment"
              body="A YOLOv8 model counts and classifies the waste. Volume, material severity and location sensitivity produce a 0–100 priority score with a published breakdown."
            />
            <Feature
              title="Authority routing"
              body="The ward office is matched from the coordinates, hazardous material is redirected to pollution control, and every notice is logged with its intended recipient."
            />
          </dl>
        </div>

        <Card className="lg:justify-self-end lg:w-full lg:max-w-md">
          <CardHeader className="border-b">
            <CardTitle>Sign in</CardTitle>
            <CardDescription>
              Report anonymously, or sign in with a verified email address.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <Tabs
              value={tab}
              onValueChange={(value) => {
                setTab(String(value));
                setErrorMessage("");
              }}
            >
              <TabsList className="w-full">
                <TabsTrigger value="anonymous">Anonymous</TabsTrigger>
                <TabsTrigger value="clerk">Email</TabsTrigger>
              </TabsList>

              <TabsContent value="anonymous" className="pt-4">
                <form onSubmit={handleAnonymousSubmit} className="space-y-5">
                  <Field>
                    <div className="flex items-center justify-between gap-2">
                      <FieldLabel htmlFor="handle">Handle</FieldLabel>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={generateHandle}
                      >
                        <RefreshCw />
                        Generate
                      </Button>
                    </div>
                    <Input
                      id="handle"
                      required
                      value={username}
                      onChange={(e) => {
                        setUsername(e.target.value);
                        setErrorMessage("");
                      }}
                      placeholder="EcoWarrior99"
                    />
                    <FieldDescription>
                      3–30 characters. Letters, numbers, underscores and dashes.
                    </FieldDescription>
                  </Field>

                  {errorMessage && (
                    <Alert variant="destructive">
                      <AlertTitle>{errorMessage}</AlertTitle>
                    </Alert>
                  )}

                  <Button
                    type="submit"
                    size="lg"
                    disabled={loading}
                    className="w-full"
                  >
                    {loading ? <Spinner /> : null}
                    Continue
                    {!loading && <ArrowRight />}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="clerk" className="pt-4">
                {isClerkConfigured ? (
                  <div className="flex justify-center">
                    <SignIn
                      routing="hash"
                      fallbackRedirectUrl="/dashboard"
                      forceRedirectUrl="/dashboard"
                    />
                  </div>
                ) : (
                  <div className="space-y-4">
                    <Alert>
                      <AlertTitle>Email sign-in is not configured</AlertTitle>
                      <AlertDescription>
                        Add <code className="font-mono">
                          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
                        </code>{" "}
                        and <code className="font-mono">CLERK_SECRET_KEY</code>{" "}
                        to <code className="font-mono">.env.local</code>.
                      </AlertDescription>
                    </Alert>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => setTab("anonymous")}
                    >
                      Continue anonymously
                    </Button>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="space-y-1.5">
      <dt className="font-medium">{title}</dt>
      <dd className="text-sm leading-relaxed text-muted-foreground">{body}</dd>
    </div>
  );
}
