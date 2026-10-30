"use client";

import React, { createContext, useContext } from "react";
import { ClerkProvider, useUser } from "@clerk/nextjs";

interface ClerkUserContextType {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: {
    fullName?: string | null;
    firstName?: string | null;
    primaryEmailAddress?: {
      emailAddress?: string;
    };
  } | null;
  isClerkConfigured: boolean;
}

const defaultContext: ClerkUserContextType = {
  isLoaded: true,
  isSignedIn: false,
  user: null,
  isClerkConfigured: false,
};

const ClerkUserContext = createContext<ClerkUserContextType>(defaultContext);

export function useSafeClerk() {
  return useContext(ClerkUserContext);
}

// Inner component that safely reads from ClerkProvider when it is active
function ClerkBridge({ children }: { children: React.ReactNode }) {
  const clerk = useUser();

  const value: ClerkUserContextType = {
    isLoaded: clerk.isLoaded,
    isSignedIn: Boolean(clerk.isSignedIn),
    user: clerk.user
      ? {
          fullName: clerk.user.fullName,
          firstName: clerk.user.firstName,
          primaryEmailAddress: {
            emailAddress: clerk.user.primaryEmailAddress?.emailAddress,
          },
        }
      : null,
    isClerkConfigured: true,
  };

  return (
    <ClerkUserContext.Provider value={value}>
      {children}
    </ClerkUserContext.Provider>
  );
}

export function ClerkWrapper({ children }: { children: React.ReactNode }) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const isKeyValid = Boolean(
    publishableKey &&
      publishableKey.startsWith("pk_") &&
      !publishableKey.includes("placeholder")
  );

  if (!isKeyValid) {
    // If Clerk keys are not configured, render with fallback context
    // This prevents "useUser can only be used within <ClerkProvider />" errors
    return (
      <ClerkUserContext.Provider value={defaultContext}>
        {children}
      </ClerkUserContext.Provider>
    );
  }

  return (
    <ClerkProvider
      publishableKey={publishableKey}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
    >
      <ClerkBridge>{children}</ClerkBridge>
    </ClerkProvider>
  );
}
