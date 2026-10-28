"use client";

import { SignUp } from "@clerk/nextjs";
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

export default function SignUpPage() {
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
            <CardTitle>Create an account</CardTitle>
            <CardDescription>
              Register an email address to track the reports you submit.
            </CardDescription>
          </CardHeader>

          <CardContent>
            {isClerkReady ? (
              <div className="flex justify-center">
                <SignUp
                  routing="path"
                  path="/sign-up"
                  signInUrl="/sign-in"
                  fallbackRedirectUrl="/dashboard"
                  forceRedirectUrl="/dashboard"
                />
              </div>
            ) : (
              <div className="space-y-4">
                <Alert>
                  <AlertTitle>Registration is not configured</AlertTitle>
                  <AlertDescription>
                    Add your Clerk keys to{" "}
                    <code className="font-mono">.env.local</code> to enable
                    email registration.
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
