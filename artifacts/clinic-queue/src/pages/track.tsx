import { useGetPublicTracking } from "@workspace/api-client-react";
import { useParams } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Clock, Users, Activity, CheckCircle2, XCircle, Heart, SkipForward, Sparkles, RefreshCw, Phone, MapPin } from "lucide-react";
import { useEffect, useState } from "react";

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "in_progress":
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-semibold border border-primary/20">
          <Activity className="h-3.5 w-3.5" />
          In Progress
        </span>
      );
    case "done":
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-700 text-sm font-semibold border border-emerald-500/20">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Completed
        </span>
      );
    case "skipped":
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-700 text-sm font-semibold border border-amber-500/20">
          <SkipForward className="h-3.5 w-3.5" />
          Skipped
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 text-blue-700 text-sm font-semibold border border-blue-500/20">
          <Clock className="h-3.5 w-3.5" />
          Waiting
        </span>
      );
  }
}

function PulsingDot({ isActive }: { isActive: boolean }) {
  if (!isActive) return null;
  return (
    <span className="relative inline-flex h-3 w-3">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
      <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
    </span>
  );
}

export default function Track() {
  const { trackingCode } = useParams<{ trackingCode: string }>();
  const { data: tracking, isLoading, error, refetch, isFetching } = useGetPublicTracking(
    trackingCode!, 
    { query: { queryKey: ["public-tracking", trackingCode], enabled: !!trackingCode, refetchInterval: 5000 } }
  );

  const [timeElapsed, setTimeElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTimeElapsed(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-[100dvh] items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-primary/20 flex items-center justify-center">
            <Heart className="h-6 w-6 text-primary/40" />
          </div>
          <p className="text-muted-foreground font-medium">Finding your status...</p>
        </div>
      </div>
    );
  }

  if (error || !tracking) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="max-w-md w-full shadow-botanical border-border/50">
          <CardContent className="p-8 text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center mb-4">
              <XCircle className="h-6 w-6 text-destructive/50" />
            </div>
            <h2 className="font-heading text-xl text-foreground mb-2">Tracking code not found</h2>
            <p className="text-muted-foreground text-sm">This tracking link may have expired. Please ask the clinic for your updated link.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isYourTurn = tracking.status === "in_progress" || tracking.reminderStage === "your_turn";
  const isDone = tracking.status === "done";
  const isSkipped = tracking.status === "skipped";
  const isWaiting = tracking.status === "waiting";
  const isAlmostThere = tracking.patientsAhead <= 2 && isWaiting;

  return (
    <div className="relative flex-1 w-full overflow-hidden">
      <div className="absolute inset-0 bg-dots-botanical opacity-30" />
      {isYourTurn && (
        <div className="absolute inset-0 animate-pulse-soft bg-gradient-to-b from-primary/[0.06] to-transparent pointer-events-none" />
      )}

      <div className="relative z-10 max-w-lg mx-auto p-4 md:p-8 flex flex-col justify-center min-h-[calc(100dvh-4rem)] animate-fade-up-in">
        
        <Card className="shadow-botanical-lg border-border/50 overflow-hidden">
          <div className={`h-1.5 w-full ${
            isYourTurn ? 'bg-gradient-to-r from-primary via-emerald-500 to-primary animate-shimmer' :
            isDone ? 'bg-emerald-500' :
            isSkipped ? 'bg-amber-500' :
            'bg-gradient-to-r from-primary via-emerald-500 to-amber-500'
          }`} />
          
          <CardContent className="p-6 space-y-6">
            {/* Header */}
            <div className="text-center">
              <p className="text-sm font-medium text-muted-foreground mb-1">
                {tracking.clinicName} · Dr. {tracking.doctorName}
              </p>
              <div className="flex items-center justify-center gap-2 mt-2">
                <StatusBadge status={tracking.status} />
                <PulsingDot isActive={isYourTurn || isAlmostThere} />
              </div>
            </div>

            {/* Token display */}
            <div className="text-center py-4">
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-[0.2em] mb-2">Your Token</p>
              <div className={`inline-flex items-center justify-center w-28 h-28 rounded-3xl text-5xl font-bold tabular-nums font-heading shadow-botanical ${
                isYourTurn ? 'bg-primary text-primary-foreground animate-scale-breathe' :
                isDone ? 'bg-emerald-500 text-white' :
                isSkipped ? 'bg-amber-500 text-white' :
                'bg-muted/50 text-foreground border-2 border-border/50'
              }`}>
                {tracking.tokenNumber}
              </div>
            </div>

            {/* Your turn callout */}
            {isYourTurn && !isDone && (
              <div className="rounded-2xl border-2 border-primary bg-primary/[0.08] p-6 text-center space-y-3 shadow-lg shadow-primary/20 animate-pulse-soft">
                <div className="flex justify-center mb-2">
                  <Sparkles className="h-8 w-8 text-primary animate-bounce" />
                </div>
                <p className="text-2xl font-heading font-bold text-primary tracking-tight">URGENT: IT'S YOUR TURN!</p>
                <p className="text-base text-foreground font-medium">Dr. {tracking.doctorName} is ready to see you.</p>
                <p className="text-sm text-muted-foreground">Please head to the consultation room immediately.</p>
              </div>
            )}

            {isDone && (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-5 text-center space-y-1.5">
                <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto mb-2" />
                <p className="text-lg font-heading font-bold text-emerald-700">Consultation complete</p>
                <p className="text-sm text-muted-foreground">Thank you for visiting. We hope you feel better soon.</p>
              </div>
            )}

            {isSkipped && (
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] p-5 text-center space-y-1.5">
                <SkipForward className="h-8 w-8 text-amber-600 mx-auto mb-2" />
                <p className="text-lg font-heading font-bold text-amber-700">You were skipped</p>
                <p className="text-sm text-muted-foreground">Please check with the clinic receptionist.</p>
              </div>
            )}

            {/* Queue info */}
            {isWaiting && (
              <div className="space-y-6">
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-4 bg-muted/40 rounded-2xl text-center border border-border/50">
                    <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-1">Position</p>
                    <p className="text-2xl font-bold text-foreground font-heading">{tracking.position}</p>
                  </div>
                  <div className="p-4 bg-muted/40 rounded-2xl text-center border border-border/50">
                    <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-1">Ahead</p>
                    <p className="text-2xl font-bold text-foreground font-heading">{tracking.patientsAhead}</p>
                  </div>
                  <div className="p-4 bg-muted/40 rounded-2xl text-center border border-border/50">
                    <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-1">~Wait</p>
                    <p className="text-2xl font-bold text-foreground font-heading">{tracking.estimatedWaitMinutes}<span className="text-lg font-normal text-muted-foreground">m</span></p>
                  </div>
                </div>

                {/* Progress bar */}
                {(tracking.totalToday ?? 0) > 0 && tracking.currentTokenNumber != null && (
                  <div className="space-y-2 pt-2">
                    <div className="flex justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      <span>Serving: #{tracking.currentTokenNumber}</span>
                      <span>Your Turn: #{tracking.tokenNumber}</span>
                    </div>
                    <Progress value={Math.min(100, Math.max(0, ((tracking.currentTokenNumber / tracking.tokenNumber) * 100)))} className="h-2" />
                  </div>
                )}
              </div>
            )}

            {/* Actions & Auto-refresh notice */}
            <div className="pt-4 border-t border-border/50 space-y-4">
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 rounded-xl shadow-sm h-11" onClick={() => refetch()} disabled={isFetching}>
                  <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
                  {isFetching ? 'Updating...' : 'Refresh'}
                </Button>
                {tracking.clinicWhatsappNumber && (
                  <Button variant="outline" className="flex-1 rounded-xl shadow-sm h-11" asChild>
                    <a href={`tel:${tracking.clinicWhatsappNumber.replace(/\D/g, '')}`}>
                      <Phone className="mr-2 h-4 w-4 text-primary" />
                      Contact Clinic
                    </a>
                  </Button>
                )}
              </div>
              
              {(isWaiting || isYourTurn) && (
                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground/80">
                  <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></div>
                  Live updating every 5s
                </div>
              )}
            </div>

            {/* Clinic Info Footer */}
            {tracking.clinicAddress && (
              <div className="mt-6 p-4 bg-muted/30 rounded-2xl border border-border/50 flex gap-3 text-sm">
                <MapPin className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <p className="text-muted-foreground">{tracking.clinicAddress}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
