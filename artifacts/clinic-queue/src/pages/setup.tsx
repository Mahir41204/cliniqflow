import { useAuth } from "@workspace/auth-web";
import { useCreateMyClinic, useGetMyClinic, getGetMyClinicQueryKey } from "@workspace/api-client-react";
import { useLocation, Redirect } from "wouter";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Stethoscope, User, Clock, Phone, Sparkles } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

const clinicNamePattern = /^[A-Za-z0-9][A-Za-z0-9\s.'&-]{1,79}$/;
const doctorNamePattern = /^[A-Za-z][A-Za-z\s.'-]{1,79}$/;
const phonePattern = /^\d{10,15}$/;

const setupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Clinic name is required")
    .max(80, "Clinic name is too long")
    .regex(clinicNamePattern, "Use letters, numbers, spaces, and .&'- only"),
  doctorName: z
    .string()
    .trim()
    .min(2, "Doctor name is required")
    .max(80, "Doctor name is too long")
    .regex(doctorNamePattern, "Use letters, spaces, and .'- only"),
  avgConsultationMinutes: z.coerce.number().int().min(1).max(120),
  whatsappNumber: z
    .string()
    .trim()
    .regex(phonePattern, "Enter 10-15 digits, country code included"),
});

export default function Setup() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [submitError, setSubmitError] = useState<string | null>(null);
  
  const { data: clinicData, isLoading: isClinicLoading } = useGetMyClinic({ 
    query: { enabled: isAuthenticated, queryKey: getGetMyClinicQueryKey() } 
  });

  const createClinic = useCreateMyClinic();

  const form = useForm<z.infer<typeof setupSchema>>({
    resolver: zodResolver(setupSchema),
    defaultValues: {
      name: "",
      doctorName: "",
      avgConsultationMinutes: 15,
      whatsappNumber: "",
    },
  });

  if (isAuthLoading || isClinicLoading) {
    return null;
  }

  if (!isAuthenticated) return <Redirect to="/" />;
  if (clinicData?.clinic) return <Redirect to="/dashboard" />;

  async function onSubmit(values: z.infer<typeof setupSchema>) {
    setSubmitError(null);
    try {
      const clinic = await createClinic.mutateAsync({ data: values });
      queryClient.setQueryData(getGetMyClinicQueryKey(), { clinic });
      await queryClient.invalidateQueries({ queryKey: getGetMyClinicQueryKey() });
      toast({
        title: "Clinic created",
        description: "Taking you to the dashboard.",
      });
      window.location.assign("/dashboard");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create clinic";
      setSubmitError(message);
      toast({
        title: "Setup failed",
        description: message,
        variant: "destructive",
      });
    }
  }

  return (
    <div className="flex-1 w-full max-w-xl mx-auto p-4 md:p-8 flex flex-col justify-center animate-fade-up-in">
      <Card className="border-border/50 shadow-botanical-lg rounded-2xl overflow-hidden relative">
        <div className="h-1.5 w-full bg-gradient-to-r from-primary via-emerald-500 to-amber-500" />
        
        <CardHeader className="space-y-3 pb-6 pt-8">
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="font-heading text-2xl">Welcome to Clinic Queue</CardTitle>
            </div>
          </div>
          <CardDescription className="text-base text-muted-foreground">
            Let's set up your clinic profile. You only need to do this once.
          </CardDescription>
        </CardHeader>

        <CardContent className="pb-8">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground font-semibold flex items-center gap-2">
                      <Stethoscope className="w-4 h-4 text-primary/60" /> Clinic Name
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. City Care Clinic" className="h-12 bg-muted/30 rounded-xl" maxLength={80} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="doctorName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground font-semibold flex items-center gap-2">
                      <User className="w-4 h-4 text-primary/60" /> Doctor Name
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Sharma" className="h-12 bg-muted/30 rounded-xl" maxLength={80} {...field} />
                    </FormControl>
                    <FormDescription>Patients will see "Dr. [Name]"</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="whatsappNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground font-semibold flex items-center gap-2">
                        <Phone className="w-4 h-4 text-primary/60" /> WhatsApp Number
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="919876543210"
                          className="h-12 bg-muted/30 rounded-xl"
                          inputMode="numeric"
                          pattern="\d{10,15}"
                          maxLength={15}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>Include country code, no +</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="avgConsultationMinutes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground font-semibold flex items-center gap-2">
                        <Clock className="w-4 h-4 text-primary/60" /> Avg. Consultation
                      </FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input type="number" min={1} max={120} step={1} className="h-12 bg-muted/30 rounded-xl pr-16" {...field} />
                          <span className="absolute right-4 top-3.5 text-muted-foreground text-sm pointer-events-none">min</span>
                        </div>
                      </FormControl>
                      <FormDescription>Used to estimate wait times</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {submitError && (
                <div className="rounded-xl border border-destructive/20 bg-destructive/[0.06] px-4 py-3 text-sm text-destructive">
                  {submitError}
                </div>
              )}

              <div className="pt-2">
                <Button type="submit" size="lg" className="w-full h-14 text-lg rounded-xl shadow-sm" disabled={createClinic.isPending}>
                  {createClinic.isPending ? "Setting up..." : "Complete Setup"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
