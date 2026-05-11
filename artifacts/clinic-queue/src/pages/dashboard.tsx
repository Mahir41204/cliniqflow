import { useGetMyClinic, useGetMyClinicStats, useListMyQueue, useGetMyClinicHistory, useAddPatientToQueue, useAdvanceQueue, useRemovePatient, useSkipPatient, getGetMyClinicQueryKey, getGetMyClinicStatsQueryKey, getListMyQueueQueryKey, getGetMyClinicHistoryQueryKey } from "@workspace/api-client-react";
import type { Patient } from "@workspace/api-client-react";
import { useAuth } from "@workspace/auth-web";
import { Redirect, Link } from "wouter";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { QRCodeCanvas } from "qrcode.react";
import { Copy, Plus, MoreVertical, SkipForward, Trash2, ArrowRight, Activity, Users, Clock, CheckCircle2, UserPlus, QrCode, History } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useState, useRef } from "react";

const addPatientSchema = z.object({
  name: z.string().min(2, "Name required"),
  phone: z.string().min(4, "Phone required"),
});

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 6) return digits;
  return digits.slice(0, 3) + "····" + digits.slice(-3);
}

export default function Dashboard() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: clinicData, isLoading: isClinicLoading } = useGetMyClinic({ 
    query: { enabled: isAuthenticated, queryKey: getGetMyClinicQueryKey() } 
  });
  const clinic = clinicData?.clinic;

  const statsQuery = useGetMyClinicStats({ 
    query: { enabled: !!clinic, refetchInterval: 3000, queryKey: getGetMyClinicStatsQueryKey() } 
  });
  const stats = statsQuery.data;

  const queueQuery = useListMyQueue({
    query: { enabled: !!clinic, refetchInterval: 3000, queryKey: getListMyQueueQueryKey() }
  });
  const queue = queueQuery.data || [];

  const historyQuery = useGetMyClinicHistory({
    query: { enabled: !!clinic, refetchInterval: 3000, queryKey: getGetMyClinicHistoryQueryKey() }
  });
  const history = historyQuery.data || [];

  const addPatient = useAddPatientToQueue();
  const advanceQueue = useAdvanceQueue();
  const skipPatient = useSkipPatient();
  const removePatient = useRemovePatient();

  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const form = useForm<z.infer<typeof addPatientSchema>>({
    resolver: zodResolver(addPatientSchema),
    defaultValues: { name: "", phone: "" },
  });

  const invalidateData = () => {
    queryClient.invalidateQueries({ queryKey: getGetMyClinicStatsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListMyQueueQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetMyClinicHistoryQueryKey() });
  };

  const addPatientRef = useRef(addPatient.mutate);
  addPatientRef.current = addPatient.mutate;

  function onAddSubmit(values: z.infer<typeof addPatientSchema>) {
    addPatientRef.current(
      { data: values },
      {
        onSuccess: (newPatient) => {
          invalidateData();
          setAddDialogOpen(false);
          form.reset();
          toast({
            title: "Patient Added",
            description: `${newPatient.name} assigned token #${newPatient.tokenNumber}`,
          });
        }
      }
    );
  }

  const advanceQueueRef = useRef(advanceQueue.mutate);
  advanceQueueRef.current = advanceQueue.mutate;

  const handleNextPatient = () => {
    advanceQueueRef.current(undefined, {
      onSuccess: (result) => {
        invalidateData();
        toast({
          title: result.current ? `Now serving #${result.current.tokenNumber}` : "Queue advanced",
          description: result.current ? `${result.current.name} is up next.` : "No more patients waiting.",
        });
      }
    });
  };

  const handleSkip = (id: string) => {
    skipPatient.mutate({ id }, {
      onSuccess: () => {
        invalidateData();
        toast({ title: "Patient Skipped" });
      }
    });
  };

  const handleRemove = (id: string) => {
    removePatient.mutate({ id }, {
      onSuccess: () => {
        invalidateData();
        toast({ title: "Patient Removed" });
      }
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  if (isAuthLoading || isClinicLoading) return null;
  if (!isAuthenticated) return <Redirect to="/" />;
  if (!clinic) return <Redirect to="/setup" />;

  const currentlyServing = queue.find(p => p.status === "in_progress");
  const waitingList = queue.filter(p => p.status === "waiting").sort((a, b) => a.position - b.position);
  
  const cleanPhone = clinic.whatsappNumber.replace(/\D/g, '');
  const waUrl = `https://wa.me/${cleanPhone}?text=Hi`;
  const joinUrl = `${window.location.origin}${import.meta.env.BASE_URL}join/${clinic.slug}`;

  return (
    <div className="flex-1 w-full max-w-7xl mx-auto p-4 md:p-6 lg:p-8 animate-fade-up-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="font-heading text-3xl tracking-tight text-foreground">Queue Dashboard</h1>
          <p className="text-muted-foreground mt-1">{format(new Date(), 'EEEE, MMMM do, yyyy')}</p>
        </div>
        <div className="flex gap-3 w-full md:w-auto">
          <Button
            size="lg"
            className="flex-1 md:flex-none shadow-sm rounded-xl h-12 px-6"
            onClick={handleNextPatient}
            disabled={advanceQueue.isPending || (waitingList.length === 0 && !currentlyServing)}
          >
            Call Next Patient <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="lg" variant="secondary" className="shadow-sm rounded-xl h-12">
                <UserPlus className="mr-2 h-5 w-5" /> Add
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md rounded-2xl">
              <DialogHeader>
                <DialogTitle className="font-heading text-xl">Add Patient</DialogTitle>
                <DialogDescription>Manually add a walk-in patient to the queue.</DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onAddSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Patient Name</FormLabel>
                        <FormControl>
                          <Input placeholder="John Doe" className="h-11 rounded-xl bg-muted/30" {...field} />
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
                        <FormLabel>Mobile Number</FormLabel>
                        <FormControl>
                          <Input placeholder="9876543210" type="tel" className="h-11 rounded-xl bg-muted/30" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter className="pt-4">
                    <DialogClose asChild>
                      <Button type="button" variant="ghost" className="rounded-xl">Cancel</Button>
                    </DialogClose>
                    <Button type="submit" disabled={addPatient.isPending} className="rounded-xl">
                      {addPatient.isPending ? "Adding..." : "Add to Queue"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Row */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="shadow-botanical border-primary/20 bg-gradient-to-br from-primary/[0.06] to-primary/[0.02] overflow-hidden relative">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Serving</p>
                <p className="text-3xl font-bold text-foreground tabular-nums font-heading">
                  {stats.currentTokenNumber ? `#${stats.currentTokenNumber}` : "—"}
                </p>
              </div>
              <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Activity className="h-5 w-5 text-primary" />
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-botanical overflow-hidden">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Waiting</p>
                <p className="text-3xl font-bold text-foreground tabular-nums font-heading">{stats.waiting}</p>
              </div>
              <div className="h-10 w-10 rounded-2xl bg-amber-500/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-amber-600" />
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-botanical overflow-hidden">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Served</p>
                <p className="text-3xl font-bold text-foreground tabular-nums font-heading">{stats.served}</p>
              </div>
              <div className="h-10 w-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-botanical overflow-hidden">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Avg Wait</p>
                <p className="text-3xl font-bold text-foreground tabular-nums font-heading">{stats.avgWaitMinutes}<span className="text-lg text-muted-foreground font-normal ml-0.5">m</span></p>
              </div>
              <div className="h-10 w-10 rounded-2xl bg-blue-500/10 flex items-center justify-center">
                <Clock className="h-5 w-5 text-blue-600" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Queue Column */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Currently Serving */}
          <Card className="shadow-botanical border-primary/20 overflow-hidden">
            <div className="bg-gradient-to-r from-primary/10 to-primary/[0.04] px-5 py-3 border-b border-primary/10 flex justify-between items-center">
              <h2 className="font-heading text-base text-primary flex items-center gap-2">
                <Activity className="h-4 w-4" /> Currently Serving
              </h2>
            </div>
            <CardContent className="p-6">
              {currentlyServing ? (
                <div className="flex items-center justify-between animate-slide-in-right">
                  <div className="flex items-center gap-4">
                    <div className="h-16 w-16 bg-primary text-primary-foreground rounded-2xl flex items-center justify-center text-2xl font-bold tabular-nums shadow-sm font-heading">
                      {currentlyServing.tokenNumber}
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-foreground">{currentlyServing.name}</h3>
                      <p className="text-muted-foreground text-sm">{maskPhone(currentlyServing.phone)}</p>
                      <div className="mt-1.5 inline-flex text-xs font-medium bg-primary/[0.06] border border-primary/15 px-2.5 py-0.5 rounded-lg">
                        <Link href={`/track/${currentlyServing.trackingCode}`} target="_blank" className="text-primary hover:underline">
                          View tracking
                        </Link>
                      </div>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="rounded-xl">
                      <DropdownMenuItem onClick={() => handleSkip(currentlyServing.id)} className="rounded-lg">
                        <SkipForward className="mr-2 h-4 w-4" /> Skip
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ) : (
                <div className="py-8 text-center">
                  <div className="mx-auto h-12 w-12 rounded-2xl bg-muted/50 flex items-center justify-center mb-3">
                    <Activity className="h-5 w-5 text-muted-foreground/40" />
                  </div>
                  <p className="text-muted-foreground">No patient currently being served.</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Press "Call Next Patient" to begin.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Waiting Queue */}
          <Card className="shadow-botanical flex-1 flex flex-col overflow-hidden">
            <div className="px-5 py-3 border-b bg-muted/20 flex justify-between items-center">
              <h2 className="font-heading text-base text-foreground flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" /> Up Next
                <span className="ml-1 text-sm font-sans font-normal text-muted-foreground">({waitingList.length})</span>
              </h2>
            </div>
            <ScrollArea className="flex-1 max-h-[500px]">
              {waitingList.length > 0 ? (
                <div className="divide-y divide-border/50">
                  {waitingList.map((patient, index) => (
                    <div
                      key={patient.id}
                      className="p-4 flex items-center justify-between hover:bg-muted/20 transition-colors group animate-fade-up-in"
                      style={{ animationDelay: `${index * 40}ms` }}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-11 h-11 bg-muted/50 rounded-xl flex items-center justify-center text-lg font-bold tabular-nums text-foreground border border-border/50 shadow-sm font-heading">
                          {patient.tokenNumber}
                        </div>
                        <div>
                          <h4 className="font-semibold text-foreground">{patient.name}</h4>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                            <span className="bg-muted/50 px-1.5 py-0.5 rounded">#{patient.position}</span>
                            <span>~{patient.estimatedWaitMinutes}m wait</span>
                          </div>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 rounded-lg">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="rounded-xl">
                          <DropdownMenuItem onClick={() => handleSkip(patient.id)} className="rounded-lg">
                            <SkipForward className="mr-2 h-4 w-4" /> Skip Patient
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleRemove(patient.id)} className="text-destructive focus:text-destructive rounded-lg">
                            <Trash2 className="mr-2 h-4 w-4" /> Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-12 text-center">
                  <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-4">
                    <CheckCircle2 className="h-6 w-6 text-emerald-500/50" />
                  </div>
                  <p className="text-muted-foreground font-medium">Queue is empty</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Add a patient or share the join link.</p>
                </div>
              )}
            </ScrollArea>
          </Card>
        </div>

        {/* Sidebar Column */}
        <div className="flex flex-col gap-6">
          {/* QR / Links */}
          <Card className="shadow-botanical overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="font-heading text-lg flex items-center gap-2">
                <QrCode className="h-4 w-4 text-primary" /> Patient Registration
              </CardTitle>
              <CardDescription>Share QR code for patients to self-register.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex justify-center p-5 bg-white rounded-2xl border border-border/50 shadow-sm">
                <QRCodeCanvas value={joinUrl} size={180} level="H" includeMargin={false} />
              </div>
              
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Join Link</p>
                  <div className="flex items-center gap-2">
                    <Input readOnly value={joinUrl} className="h-9 font-mono text-xs bg-muted/30 rounded-lg" />
                    <Button variant="secondary" size="icon" className="h-9 w-9 shrink-0 rounded-lg" onClick={() => copyToClipboard(joinUrl)}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">WhatsApp</p>
                  <div className="flex items-center gap-2">
                    <Input readOnly value={waUrl} className="h-9 font-mono text-xs bg-muted/30 rounded-lg" />
                    <Button variant="secondary" size="icon" className="h-9 w-9 shrink-0 rounded-lg" onClick={() => copyToClipboard(waUrl)}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* History */}
          <Card className="shadow-botanical overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="font-heading text-lg flex items-center gap-2">
                <History className="h-4 w-4 text-muted-foreground" /> Recent History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {history.length > 0 ? (
                <div className="space-y-2.5">
                  {history.slice(0, 6).map((patient) => (
                    <div key={patient.id} className="flex items-center justify-between text-sm py-1.5">
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground font-mono text-xs bg-muted/50 px-1.5 py-0.5 rounded">#{patient.tokenNumber}</span>
                        <span className="font-medium truncate max-w-[120px]">{patient.name}</span>
                      </div>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        patient.status === 'done' 
                          ? 'bg-emerald-500/10 text-emerald-700' 
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        {patient.status === 'done' ? 'Done' : 'Skipped'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-6">No completed patients yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
