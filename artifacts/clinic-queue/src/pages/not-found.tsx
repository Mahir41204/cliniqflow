import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Home, Search } from "lucide-react";

function LeafDecor({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" fill="none" className={className}>
      <path d="M60 10C60 10 90 30 90 60C90 90 60 110 60 110C60 110 30 90 30 60C30 30 60 10 60 10Z" fill="currentColor" fillOpacity="0.06" />
    </svg>
  );
}

export default function NotFound() {
  return (
    <div className="relative flex-1 flex items-center justify-center p-4 overflow-hidden">
      <div className="absolute inset-0 bg-dots-botanical opacity-30" />
      <LeafDecor className="absolute -top-10 -left-10 h-48 w-48 text-primary/20" />
      <LeafDecor className="absolute -bottom-10 -right-10 h-40 w-40 text-primary/15 rotate-180" />

      <Card className="relative z-10 max-w-md w-full shadow-botanical-lg border-border/50 overflow-hidden animate-fade-up-in">
        <div className="h-1.5 w-full bg-gradient-to-r from-primary via-emerald-500 to-amber-500" />
        <CardContent className="p-8 text-center space-y-6">
          <div className="space-y-2">
            <p className="text-7xl font-heading font-bold text-primary/20">404</p>
            <h1 className="font-heading text-2xl text-foreground">Page not found</h1>
            <p className="text-muted-foreground">
              The page you're looking for doesn't exist or has been moved.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild className="rounded-xl shadow-sm">
              <Link href="/">
                <Home className="mr-2 h-4 w-4" /> Go Home
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
