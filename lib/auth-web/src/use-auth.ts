import { useCallback, useEffect, useState } from "react";

export interface AuthUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
}

export interface AuthCredentials {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

interface AuthEnvelope {
  user: AuthUser | null;
}

let apiBaseUrl = "http://localhost:8080";

export function setApiBaseUrl(url: string | null): void {
  apiBaseUrl = url ?? "";
}

function resolveApiUrl(path: string): string {
  return apiBaseUrl ? new URL(path, apiBaseUrl).toString() : path;
}

function resolveGoogleAuthUrl(params?: { returnTo?: string }): string {
  const url = new URL(resolveApiUrl("/api/auth/google"));
  if (params?.returnTo) {
    url.searchParams.set("returnTo", params.returnTo);
  }
  return url.toString();
}

async function requestAuth(path: string, options?: { body?: AuthCredentials; method?: string }): Promise<AuthEnvelope> {
  const { body, method } = options ?? {};
  const resolvedMethod = method ?? (body ? "POST" : "GET");
  const response = await fetch(resolveApiUrl(path), {
    method: resolvedMethod,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = (await response.json().catch(() => null)) as
    | AuthEnvelope
    | { user?: AuthUser | null; error?: string; message?: string }
    | null;

  if (!response.ok) {
    const errMsg =
      (payload && "message" in payload && payload.message) ||
      (payload && "error" in payload && payload.error) ||
      "Authentication failed";
    const err = new Error(errMsg);
    (err as any).status = response.status;
    (err as any).serverMessage = payload && "message" in payload ? payload.message : undefined;
    throw err;
  }

  return { user: payload && "user" in payload ? payload.user ?? null : null };
}

export function beginGoogleAuth(params?: { returnTo?: string }): string {
  return resolveGoogleAuthUrl(params);
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadUser = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await requestAuth("/api/auth/user");
      setUser(response.user);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUser();
  }, [loadUser]);

  const login = useCallback(async (credentials: AuthCredentials) => {
    const response = await requestAuth("/api/login", { body: credentials });
    setUser(response.user);
    return response.user;
  }, []);

  const register = useCallback(async (credentials: AuthCredentials) => {
    const response = await requestAuth("/api/register", { body: credentials });
    setUser(response.user);
    return response.user;
  }, []);

  const logout = useCallback(async () => {
    await requestAuth("/api/logout", { method: "POST" });
    setUser(null);
  }, []);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    register,
    logout,
    refresh: loadUser,
    beginGoogleAuth,
  };
}