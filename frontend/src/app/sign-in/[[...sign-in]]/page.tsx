"use client";

import { SignIn } from "@clerk/nextjs";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function SignInPage() {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const isClerkReady = Boolean(
    publishableKey &&
      publishableKey.startsWith("pk_") &&
      !publishableKey.includes("placeholder")
  );

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to CivicBridge
        </Link>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>Sign in</CardTitle>
            <CardDescription>
              Use a verified email address to report under your own identity.
            </CardDescription>
          </CardHeader>

          <CardContent>
            {isClerkReady ? (
              <div className="flex justify-center">
                <SignIn
                  routing="path"
                  path="/sign-in"
                  signUpUrl="/sign-up"
                  fallbackRedirectUrl="/dashboard"
                  forceRedirectUrl="/dashboard"
                />
              </div>
            ) : (
              <div className="space-y-4">
                <Alert>
                  <AlertTitle>Email sign-in is not configured</AlertTitle>
                  <AlertDescription>
                    Add{" "}
                    <code className="font-mono">
                      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
                    </code>{" "}
                    and <code className="font-mono">CLERK_SECRET_KEY</code> to{" "}
                    <code className="font-mono">.env.local</code>.
                  </AlertDescription>
                </Alert>

                <Button
                  variant="outline"
                  className="w-full"
                  render={<Link href="/" />}
                  nativeButton={false}
                >
                  Continue anonymously
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
