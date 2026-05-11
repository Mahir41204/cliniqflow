import { useAuth } from "@workspace/auth-web";
import { useGetMyClinic, useUpdateMyClinic, getGetMyClinicQueryKey } from "@workspace/api-client-react";
import { Redirect, Link } from "wouter";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Stethoscope, User, Clock, Phone, ArrowLeft, Settings as SettingsIcon, Save, Check } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";

const updateSchema = z.object({
  name: z.string().min(2, "Clinic name is required"),
  doctorName: z.string().min(2, "Doctor name is required"),
  avgConsultationMinutes: z.coerce.number().min(1).max(120),
  whatsappNumber: z.string().min(10, "Enter valid WhatsApp number with country code")
    .regex(/^\d+$/, "Digits only — no +, spaces or hyphens"),
});

export default function Settings() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [saved, setSaved] = useState(false);
  
  const { data: clinicData, isLoading: isClinicLoading } = useGetMyClinic({ 
    query: { enabled: isAuthenticated, queryKey: getGetMyClinicQueryKey() } 
  });
  const clinic = clinicData?.clinic;

  const updateClinic = useUpdateMyClinic();

  const form = useForm<z.infer<typeof updateSchema>>({
    resolver: zodResolver(updateSchema),
    defaultValues: {
      name: "",
      doctorName: "",
      avgConsultationMinutes: 15,
      whatsappNumber: "",
    },
  });

  useEffect(() => {
    if (clinic) {
      form.reset({
        name: clinic.name,
        doctorName: clinic.doctorName,
        avgConsultationMinutes: clinic.avgConsultationMinutes,
        whatsappNumber: clinic.whatsappNumber,
      });
    }
  }, [clinic, form]);

  if (isAuthLoading || isClinicLoading) return null;
  if (!isAuthenticated) return <Redirect to="/" />;
  if (!clinic) return <Redirect to="/setup" />;

  async function onSubmit(values: z.infer<typeof updateSchema>) {
    try {
      await updateClinic.mutateAsync({ data: values });
      queryClient.invalidateQueries({ queryKey: getGetMyClinicQueryKey() });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      toast({
        title: "Settings updated",
        description: "Your clinic configuration has been saved.",
      });
    } catch (error) {
      toast({
        title: "Update failed",
        description: error instanceof Error ? error.message : "Failed to update",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="flex-1 w-full max-w-2xl mx-auto p-4 md:p-8 animate-fade-up-in">
      <div className="mb-8">
        <Button variant="ghost" size="sm" className="mb-4 -ml-2 rounded-xl text-muted-foreground" asChild>
          <Link href="/dashboard"><ArrowLeft className="mr-2 h-4 w-4" /> Dashboard</Link>
        </Button>
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-primary/10 flex items-center justify-center">
            <SettingsIcon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-heading text-3xl tracking-tight text-foreground">Clinic Settings</h1>
            <p className="text-muted-foreground">Edit your clinic profile and preferences.</p>
          </div>
        </div>
      </div>
      
      <Card className="shadow-botanical border-border/50 rounded-2xl overflow-hidden">
        <CardContent className="p-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold flex items-center gap-2">
                      <Stethoscope className="w-4 h-4 text-primary/60" /> Clinic Name
                    </FormLabel>
                    <FormControl>
                      <Input className="h-12 bg-muted/30 rounded-xl" {...field} />
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
                    <FormLabel className="font-semibold flex items-center gap-2">
                      <User className="w-4 h-4 text-primary/60" /> Doctor Name
                    </FormLabel>
                    <FormControl>
                      <Input className="h-12 bg-muted/30 rounded-xl" {...field} />
                    </FormControl>
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
                      <FormLabel className="font-semibold flex items-center gap-2">
                        <Phone className="w-4 h-4 text-primary/60" /> WhatsApp Number
                      </FormLabel>
                      <FormControl>
                        <Input className="h-12 bg-muted/30 rounded-xl" {...field} />
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
                      <FormLabel className="font-semibold flex items-center gap-2">
                        <Clock className="w-4 h-4 text-primary/60" /> Avg. Consultation
                      </FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input type="number" min={1} max={120} className="h-12 bg-muted/30 rounded-xl pr-16" {...field} />
                          <span className="absolute right-4 top-3.5 text-muted-foreground text-sm pointer-events-none">min</span>
                        </div>
                      </FormControl>
                      <FormDescription>Affects estimated wait times</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="pt-4 flex justify-end">
                <Button
                  type="submit"
                  size="lg"
                  className="min-w-[180px] h-12 rounded-xl shadow-sm"
                  disabled={updateClinic.isPending}
                >
                  {saved ? (
                    <><Check className="mr-2 h-5 w-5" /> Saved!</>
                  ) : updateClinic.isPending ? (
                    "Saving..."
                  ) : (
                    <><Save className="mr-2 h-5 w-5" /> Save Changes</>
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
