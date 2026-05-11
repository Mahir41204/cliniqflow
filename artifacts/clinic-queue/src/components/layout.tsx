import { useAuth } from "@workspace/auth-web";
import { useGetMyClinic, getGetMyClinicQueryKey } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Settings, LogOut, LayoutDashboard } from "lucide-react";

function LeafIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M11 20A7 7 0 0 1 9.8 6.9C15.5 4.9 17 3.5 19 2c1 2 2 4.5 1 8-1.5 5-5.7 8-9 10Z" />
      <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
    </svg>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, logout } = useAuth();
  const { data: clinicData } = useGetMyClinic({ query: { enabled: isAuthenticated, queryKey: getGetMyClinicQueryKey() } });
  const [location] = useLocation();
  
  const clinic = clinicData?.clinic;
  const isDashboard = location === "/dashboard";
  const isSettings = location === "/settings";

  return (
    <div className="min-h-[100dvh] flex flex-col w-full bg-background">
      <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="flex h-16 items-center justify-between px-4 sm:px-6 max-w-6xl mx-auto w-full">
          <Link href={isAuthenticated && clinic ? "/dashboard" : "/"} className="flex items-center gap-3 group">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground group-hover:scale-105 transition-all duration-300 shadow-sm">
              <LeafIcon className="h-5 w-5" />
              <div className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 border-2 border-background" />
            </div>
            <div className="flex flex-col">
              <span className="font-heading text-lg leading-tight tracking-tight text-foreground">Clinic Queue</span>
              {clinic && (
                <span className="text-xs text-muted-foreground leading-none font-medium truncate max-w-[180px] sm:max-w-xs">
                  {clinic.name} · Dr. {clinic.doctorName}
                </span>
              )}
            </div>
          </Link>

          {isAuthenticated && user && (
            <div className="flex items-center gap-2">
              {clinic && (
                <>
                  <Button
                    variant={isDashboard ? "secondary" : "ghost"}
                    size="sm"
                    className="hidden sm:inline-flex gap-2 rounded-xl"
                    asChild
                  >
                    <Link href="/dashboard">
                      <LayoutDashboard className="h-4 w-4" /> Dashboard
                    </Link>
                  </Button>
                  <Button
                    variant={isSettings ? "secondary" : "ghost"}
                    size="sm"
                    className="hidden sm:inline-flex gap-2 rounded-xl"
                    asChild
                  >
                    <Link href="/settings">
                      <Settings className="h-4 w-4" /> Settings
                    </Link>
                  </Button>
                </>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-10 w-10 rounded-full border border-border/60 shadow-sm hover:shadow-md transition-shadow">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={user.profileImageUrl || undefined} alt={user.firstName || "User"} />
                      <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">{user.firstName?.[0] || "U"}</AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56 rounded-xl shadow-botanical-lg border-border/60" align="end" forceMount>
                  <div className="flex items-center gap-3 p-3">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={user.profileImageUrl || undefined} />
                      <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xs">{user.firstName?.[0] || "U"}</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col space-y-0.5 leading-none">
                      {user.firstName && <p className="font-medium text-sm">{user.firstName} {user.lastName}</p>}
                      <p className="w-[170px] truncate text-xs text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                  <div className="border-t my-1 border-border/60" />
                  {clinic && (
                    <DropdownMenuItem asChild className="cursor-pointer py-2.5 rounded-lg mx-1 sm:hidden">
                      <Link href="/dashboard" className="flex items-center w-full">
                        <LayoutDashboard className="mr-2 h-4 w-4" />
                        <span>Dashboard</span>
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {clinic && (
                    <DropdownMenuItem asChild className="cursor-pointer py-2.5 rounded-lg mx-1">
                      <Link href="/settings" className="flex items-center w-full">
                        <Settings className="mr-2 h-4 w-4" />
                        <span>Settings</span>
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    className="cursor-pointer py-2.5 rounded-lg mx-1 text-destructive focus:text-destructive focus:bg-destructive/10"
                    onClick={() => logout()}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </header>
      <main className="flex-1 flex flex-col w-full relative">
        {children}
      </main>
    </div>
  );
}
