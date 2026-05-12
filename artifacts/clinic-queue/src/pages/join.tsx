import { useGetPublicClinic, usePublicJoinQueue } from "@workspace/api-client-react";
import { useParams } from "wouter";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Stethoscope, Users, Copy, Clock, ExternalLink, CheckCircle2, Heart } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

const joinSchema = z.object({
  name: z.string().min(2, "Name is required"),
  phone: z.string().min(4, "Phone number is required"),
  address: z.string().optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  age: z.coerce.number().min(0).max(120).optional().or(z.literal("")),
  emergencyContact: z.string().optional(),
});

function LeafDecor({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" fill="none" className={className}>
      <path d="M60 10C60 10 90 30 90 60C90 90 60 110 60 110C60 110 30 90 30 60C30 30 60 10 60 10Z" fill="currentColor" fillOpacity="0.06" />
    </svg>
  );
}

export default function Join() {
  const { slug } = useParams<{ slug: string }>();
  const { data: clinic, isLoading, error } = useGetPublicClinic(slug!, { query: { enabled: !!slug } });
  const joinQueue = usePublicJoinQueue();
  const { toast } = useToast();
  const [joinResult, setJoinResult] = useState<any>(null);

  const form = useForm<z.infer<typeof joinSchema>>({
    resolver: zodResolver(joinSchema),
    defaultValues: { name: "", phone: "", address: "", email: "", emergencyContact: "" },
  });

  if (isLoading) {
    return (
      <div className="flex h-[100dvh] items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-primary/20 flex items-center justify-center">
            <Heart className="h-6 w-6 text-primary/40" />
          </div>
          <p className="text-muted-foreground font-medium">Loading clinic...</p>
        </div>
      </div>
    );
  }

  if (error || !clinic) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="max-w-md w-full shadow-botanical border-border/50">
          <CardContent className="p-8 text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center mb-4">
              <Stethoscope className="h-6 w-6 text-destructive/50" />
            </div>
            <h2 className="font-heading text-xl text-foreground mb-2">Clinic not found</h2>
            <p className="text-muted-foreground text-sm">This clinic link may be incorrect or no longer active. Please ask your doctor's office for the correct link.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  async function onSubmit(values: z.infer<typeof joinSchema>) {
    try {
      const result = await joinQueue.mutateAsync({ slug: slug!, data: values });
      setJoinResult(result);
    } catch (err) {
      toast({
        title: "Could not join queue",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    }
  }

  if (joinResult) {
    return (
      <div className="flex-1 w-full max-w-lg mx-auto p-4 md:p-8 flex flex-col justify-center animate-fade-up-in">
        <Card className="shadow-botanical-lg border-primary/20 overflow-hidden">
          <div className="h-1.5 w-full bg-gradient-to-r from-primary via-emerald-500 to-amber-500" />
          <CardContent className="p-8 text-center space-y-6">
            <div className="mx-auto w-16 h-16 rounded-3xl bg-emerald-500/10 flex items-center justify-center animate-scale-breathe">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
            
            <div>
              <h2 className="font-heading text-3xl text-foreground mb-2">You're in the queue!</h2>
              <p className="text-muted-foreground">
                {joinResult.clinicName} · Dr. {joinResult.doctorName}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 bg-primary/[0.06] rounded-2xl border border-primary/15">
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-1">Token</p>
                <p className="text-3xl font-bold text-primary font-heading">#{joinResult.tokenNumber}</p>
              </div>
              <div className="p-4 bg-muted/40 rounded-2xl border border-border/50">
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-1">Position</p>
                <p className="text-3xl font-bold text-foreground font-heading">{joinResult.position}</p>
              </div>
              <div className="p-4 bg-muted/40 rounded-2xl border border-border/50">
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-1">Wait</p>
                <p className="text-3xl font-bold text-foreground font-heading">~{joinResult.estimatedWaitMinutes}<span className="text-lg font-normal text-muted-foreground">m</span></p>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <Button size="lg" className="w-full h-12 rounded-xl shadow-sm" asChild>
                <a href={joinResult.trackingUrl}>
                  <Clock className="mr-2 h-4 w-4" />
                  Track Your Status Live
                </a>
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="w-full h-12 rounded-xl"
                onClick={() => {
                  navigator.clipboard.writeText(joinResult.trackingUrl);
                  toast({ title: "Tracking link copied!" });
                }}
              >
                <Copy className="mr-2 h-4 w-4" />
                Copy Tracking Link
              </Button>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed bg-muted/30 rounded-xl p-3 border border-border/50">
              Bookmark the tracking link to check your position anytime. You may also receive WhatsApp notifications as your turn approaches.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative flex-1 w-full overflow-hidden">
      <div className="absolute inset-0 bg-dots-botanical opacity-30" />
      <LeafDecor className="absolute -top-10 -right-16 h-48 w-48 text-primary/20 hidden md:block" />
      
      <div className="relative z-10 max-w-lg mx-auto p-4 md:p-8 flex flex-col justify-center min-h-[calc(100dvh-4rem)] animate-fade-up-in">
        <Card className="shadow-botanical-lg border-border/50 overflow-hidden">
          <div className="h-1.5 w-full bg-gradient-to-r from-primary via-emerald-500 to-amber-500" />
          
          <CardHeader className="pb-4 pt-8 text-center">
            <div className="mx-auto mb-3 w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Users className="h-7 w-7 text-primary" />
            </div>
            <CardTitle className="font-heading text-2xl">Join the Queue</CardTitle>
            <CardDescription className="text-base">
              <span className="font-semibold text-foreground">{clinic.name}</span> · Dr. {clinic.doctorName}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5 pb-8 px-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-semibold">Your Name *</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Arjun Singh" className="h-12 bg-muted/30 rounded-xl" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-semibold">Mobile Number *</FormLabel>
                        <FormControl>
                          <Input placeholder="9876543210" type="tel" className="h-12 bg-muted/30 rounded-xl" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="age"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-semibold">Age (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="30" type="number" className="h-12 bg-muted/30 rounded-xl" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-semibold">Email (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="name@example.com" type="email" className="h-12 bg-muted/30 rounded-xl" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-semibold">Address (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="City, Area" className="h-12 bg-muted/30 rounded-xl" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="emergencyContact"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-semibold">Emergency Contact (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Name - Phone" className="h-12 bg-muted/30 rounded-xl" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="pt-2">
                  <Button type="submit" size="lg" className="w-full h-14 text-lg rounded-xl shadow-sm" disabled={joinQueue.isPending}>
                    {joinQueue.isPending ? "Joining..." : "Join Queue"}
                  </Button>
                </div>
              </form>
            </Form>

            <div className="text-center text-xs text-muted-foreground bg-muted/30 rounded-xl p-3 border border-border/50 leading-relaxed">
              Your phone number is used only for queue notifications. It is not shared with others.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
