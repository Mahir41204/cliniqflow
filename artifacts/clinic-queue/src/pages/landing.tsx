import { useAuth } from "@workspace/auth-web";
import { useGetMyClinic, getGetMyClinicQueryKey } from "@workspace/api-client-react";
import { Redirect } from "wouter";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, Users, ArrowRight, Mail, Lock, User, Globe, Sparkles, Heart, Shield } from "lucide-react";
import { useState, useEffect, useMemo } from "react";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? "http://localhost:8080" : "");

const namePattern = /^[A-Za-z][A-Za-z\s.'-]{0,79}$/;
const otpPattern = /^\d{6}$/;

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(254, "Email is too long"),
  password: z.string().min(8, "Password must be at least 8 characters").max(64, "Password is too long"),
});

const registerSchema = loginSchema.extend({
  firstName: z
    .string()
    .trim()
    .min(1, "First name is required")
    .max(80, "First name is too long")
    .regex(namePattern, "Use letters, spaces, and .'- only"),
  lastName: z
    .string()
    .trim()
    .max(80, "Last name is too long")
    .regex(namePattern, "Use letters, spaces, and .'- only")
    .optional()
    .or(z.literal("")),
});

const otpSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(254, "Email is too long"),
  otp: z.string().trim().regex(otpPattern, "Enter the 6-digit code"),
});

function LeafDecor({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" fill="none" className={className}>
      <path d="M60 10C60 10 90 30 90 60C90 90 60 110 60 110C60 110 30 90 30 60C30 30 60 10 60 10Z" fill="currentColor" fillOpacity="0.06" />
      <path d="M60 20C60 20 82 36 82 60C82 84 60 100 60 100" stroke="currentColor" strokeOpacity="0.08" strokeWidth="1" fill="none" />
    </svg>
  );
}

export default function Landing() {
  const { isAuthenticated, isLoading, login, register, refresh } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const { data: clinicData, isLoading: isLoadingClinic } = useGetMyClinic({ 
    query: { enabled: isAuthenticated, queryKey: getGetMyClinicQueryKey() } 
  });

  const isRegisterMode = mode === "register";

  const authSchema = useMemo(() => (isRegisterMode ? registerSchema : loginSchema), [isRegisterMode]);

  const authForm = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(authSchema),
    defaultValues: {
      email: "",
      password: "",
      firstName: "",
      lastName: "",
    },
  });

  const [otpMode, setOtpMode] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const otpForm = useForm<z.infer<typeof otpSchema>>({
    resolver: zodResolver(otpSchema),
    defaultValues: { email: "", otp: "" },
  });

  const googleCta = isRegisterMode ? "Continue with Google" : "Sign in with Google";

  const handleGoogleAuth = () => {
    const target = new URL("/api/auth/google", apiBaseUrl || window.location.origin);
    target.searchParams.set("returnTo", window.location.pathname);
    window.location.assign(target.toString());
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("auth") === "otp_required") {
      const email = params.get("email");
      if (email) {
        setPendingEmail(email);
        otpForm.setValue("email", email);
        setOtpMode(true);
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, [otpForm]);

  if (isLoading || (isAuthenticated && isLoadingClinic)) {
    return (
      <div className="flex h-[100dvh] items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-primary/20 flex items-center justify-center">
            <Heart className="h-6 w-6 text-primary/40" />
          </div>
          <p className="text-muted-foreground font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    if (clinicData?.clinic) {
      return <Redirect to="/dashboard" />;
    } else {
      return <Redirect to="/setup" />;
    }
  }

  const onSubmit = authForm.handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      if (isRegisterMode) {
        const data = registerSchema.parse(values);
        const res = await fetch(new URL("/api/register", apiBaseUrl || window.location.origin).toString(), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });

        if (res.status === 201) {
          setPendingEmail(data.email.toLowerCase());
          otpForm.setValue("email", data.email.toLowerCase());
          setOtpMode(true);
          return;
        }

        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          throw new Error((payload && payload.error) || "Registration failed");
        }
      } else {
        const data = loginSchema.parse(values);
        try {
          await login(data);
        } catch (loginErr: any) {
          // Handle 403 (unverified email) → switch to OTP mode
          if (loginErr?.status === 403) {
            setPendingEmail(data.email.toLowerCase());
            otpForm.setValue("email", data.email.toLowerCase());
            setOtpMode(true);
            return;
          }
          throw loginErr;
        }
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Authentication failed");
    }
  });

  const onVerifyOtp = otpForm.handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      const res = await fetch(new URL("/api/verify-otp", apiBaseUrl || window.location.origin).toString(), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: values.email, otp: values.otp }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error((payload && payload.error) || "OTP verification failed");
      }

      await refresh();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "OTP verification failed");
    }
  });

  const onResend = async () => {
    if (!pendingEmail) return;
    setSubmitError(null);
    try {
      const res = await fetch(new URL("/api/send-otp", apiBaseUrl || window.location.origin).toString(), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: pendingEmail }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error((payload && payload.error) || "Failed to resend OTP");
      }
      setSubmitSuccess("A new code has been sent!");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to resend OTP");
    }
  };

  return (
    <div className="relative min-h-[100dvh] w-full overflow-hidden bg-background">
      {/* Decorative background elements */}
      <div className="absolute inset-0 bg-dots-botanical opacity-40" />
      <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-primary/[0.06] blur-3xl" />
      <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-amber-400/[0.06] blur-3xl" />
      <LeafDecor className="absolute top-20 right-10 h-40 w-40 text-primary/30 animate-float-gentle hidden lg:block" />
      <LeafDecor className="absolute bottom-20 left-10 h-32 w-32 text-primary/20 animate-float-gentle delay-300 rotate-180 hidden lg:block" />

      <div className="relative z-10 mx-auto grid min-h-[100dvh] max-w-6xl gap-8 px-4 py-8 md:grid-cols-[1.2fr_1fr] md:items-center md:px-6 lg:gap-16 lg:px-8">
        
        {/* Left: Hero content */}
        <div className="space-y-10 animate-fade-up-in">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/[0.06] px-4 py-1.5 text-sm font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Smart queue management
          </div>

          <div className="space-y-5">
            <h1 className="font-heading max-w-3xl text-4xl tracking-tight text-foreground sm:text-5xl md:text-6xl lg:text-[4rem] lg:leading-[1.08]">
              Run your clinic queue
              <span className="block text-primary">without the chaos.</span>
            </h1>
            <p className="max-w-xl text-lg leading-8 text-muted-foreground">
              Keep the waiting room calm, let patients track their turn on mobile, and manage the day from one clean dashboard.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { icon: Users, title: "Less crowding", desc: "Patients wait outside until they're close." },
              { icon: Shield, title: "Live tracking", desc: "Tokens update automatically on every phone." },
              { icon: Clock, title: "Simple flow", desc: "Start the day, call the next patient, stay on pace." },
            ].map((item, i) => (
              <div
                key={item.title}
                className="animate-fade-up-in rounded-2xl border border-border/60 bg-card/80 p-5 shadow-botanical backdrop-blur-sm transition-all duration-300 hover:shadow-botanical-lg hover:-translate-y-0.5"
                style={{ animationDelay: `${200 + i * 100}ms` }}
              >
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <item.icon className="h-4.5 w-4.5" />
                </div>
                <p className="text-sm font-semibold text-foreground">{item.title}</p>
                <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Auth card */}
        <Card className="animate-fade-up-in delay-200 relative overflow-hidden border-border/50 bg-card shadow-botanical-lg">
          <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-primary via-emerald-500 to-amber-500" />
          <CardHeader className="space-y-2 pb-4 pt-8">
            <CardTitle className="font-heading text-2xl">Get started</CardTitle>
            <CardDescription className="text-base">Log in or create a clinic owner account.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 pb-8">
            {otpMode ? (
              <Form {...otpForm}>
                <form className="mt-3 space-y-4" onSubmit={onVerifyOtp}>
                  <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-4 text-sm text-foreground/80">
                    We sent a 6-digit code to <strong className="text-foreground">{pendingEmail}</strong>. Enter it below to verify your email.
                  </div>

                  <FormField
                    control={otpForm.control}
                    name="otp"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-medium">Verification code</FormLabel>
                        <FormControl>
                          <Input
                            className="h-12 bg-muted/30 rounded-xl text-center text-lg tracking-[0.3em] font-mono"
                            placeholder="000000"
                            inputMode="numeric"
                            pattern="\d{6}"
                            maxLength={6}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {submitError && (
                    <div className="rounded-xl border border-destructive/20 bg-destructive/[0.06] px-4 py-3 text-sm text-destructive">
                      {submitError}
                    </div>
                  )}

                  {submitSuccess && (
                    <div className="rounded-xl border border-primary/20 bg-primary/[0.06] px-4 py-3 text-sm text-primary">
                      {submitSuccess}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button type="submit" size="lg" className="h-12 flex-1 rounded-xl shadow-sm" disabled={otpForm.formState.isSubmitting}>
                      {otpForm.formState.isSubmitting ? "Verifying..." : "Verify code"}
                    </Button>
                    <Button type="button" variant="outline" size="lg" className="h-12 rounded-xl" onClick={onResend}>
                      Resend
                    </Button>
                  </div>

                  <Button type="button" variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => { setOtpMode(false); setSubmitError(null); }}>
                    ← Back to login
                  </Button>
                </form>
              </Form>
            ) : (
              <Tabs value={mode} onValueChange={(value) => { setMode(value as "login" | "register"); setSubmitError(null); }}>
                <TabsList className="grid w-full grid-cols-2 rounded-xl bg-muted/50 p-1">
                  <TabsTrigger value="login" className="rounded-lg data-[state=active]:shadow-sm">Log in</TabsTrigger>
                  <TabsTrigger value="register" className="rounded-lg data-[state=active]:shadow-sm">Create account</TabsTrigger>
                </TabsList>

                <Form {...authForm}>
                  <form className="mt-5 space-y-4" onSubmit={onSubmit}>
                    {isRegisterMode && (
                      <div className="grid grid-cols-2 gap-3">
                        <FormField
                          control={authForm.control}
                          name="firstName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="flex items-center gap-1.5 text-sm font-medium">
                                <User className="h-3.5 w-3.5 text-primary/60" /> First name
                              </FormLabel>
                              <FormControl>
                                <Input className="h-11 bg-muted/30 rounded-xl" placeholder="Asha" maxLength={80} {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={authForm.control}
                          name="lastName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-sm font-medium">Last name</FormLabel>
                              <FormControl>
                                <Input className="h-11 bg-muted/30 rounded-xl" placeholder="Sharma" maxLength={80} {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    )}

                    <FormField
                      control={authForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-1.5 text-sm font-medium">
                            <Mail className="h-3.5 w-3.5 text-primary/60" /> Email
                          </FormLabel>
                          <FormControl>
                            <Input className="h-11 bg-muted/30 rounded-xl" placeholder="owner@clinic.com" type="email" maxLength={254} autoComplete="email" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={authForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-1.5 text-sm font-medium">
                            <Lock className="h-3.5 w-3.5 text-primary/60" /> Password
                          </FormLabel>
                          <FormControl>
                            <Input className="h-11 bg-muted/30 rounded-xl" placeholder="••••••••" type="password" minLength={8} maxLength={64} autoComplete={isRegisterMode ? "new-password" : "current-password"} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {submitError && (
                      <div className="rounded-xl border border-destructive/20 bg-destructive/[0.06] px-4 py-3 text-sm text-destructive">
                        {submitError}
                      </div>
                    )}

                    <Button type="submit" size="lg" className="h-12 w-full rounded-xl shadow-sm" disabled={isLoading || authForm.formState.isSubmitting}>
                      {isLoading || authForm.formState.isSubmitting ? "Please wait..." : isRegisterMode ? "Create account" : "Log in"}
                      {!(isLoading || authForm.formState.isSubmitting) && <ArrowRight className="ml-2 h-4 w-4" />}
                    </Button>

                    <div className="relative py-1">
                      <div className="absolute inset-x-0 top-1/2 h-px bg-border/60" />
                      <span className="relative mx-auto block w-fit bg-card px-3 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground/60">
                        or
                      </span>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      className="h-12 w-full rounded-xl border-border/60 bg-card shadow-sm hover:bg-muted/30"
                      onClick={handleGoogleAuth}
                    >
                      <Globe className="mr-2 h-4 w-4" />
                      {googleCta}
                    </Button>
                  </form>
                </Form>
              </Tabs>
            )}

            <div className="rounded-2xl border border-border/50 bg-muted/30 p-4 text-sm text-muted-foreground leading-relaxed">
              Accounts are local to your database. Register once, then use the same credentials on any device pointing to this app.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
