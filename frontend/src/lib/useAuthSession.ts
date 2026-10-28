"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export interface SessionUser {
  id: string;
  username?: string;
  email?: string;
  role: string;
  type: "anonymous" | "clerk";
  createdAt?: string;
  lastActive?: string;
  isDbSaved?: boolean;
}

export function useAuthSession() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [databaseConfigured, setDatabaseConfigured] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function fetchSession() {
      try {
        const res = await fetch("/api/auth/session");
        if (!res.ok) {
          if (isMounted) setLoading(false);
          return;
        }
        const data = await res.json();
        if (isMounted) {
          if (data.authenticated && data.user) {
            setUser(data.user);
          }
          setDatabaseConfigured(Boolean(data.databaseConfigured));
          setLoading(false);
        }
      } catch (err) {
        console.error("Failed to load session:", err);
        if (isMounted) setLoading(false);
      }
    }

    fetchSession();

    return () => {
      isMounted = false;
    };
  }, []);

  const signOutAnonymous = async () => {
    try {
      await fetch("/api/auth/signout", { method: "POST" });
      setUser(null);
      router.push("/");
      router.refresh();
    } catch (err) {
      console.error("Failed to sign out:", err);
    }
  };

  return {
    user,
    loading,
    databaseConfigured,
    signOutAnonymous,
    isAuthenticated: Boolean(user),
  };
}
