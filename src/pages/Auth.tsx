import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { useAuth } from "@/hooks/use-auth";
import { ArrowRight, Bot, Loader2, Mail, UserX } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

interface AuthProps {
  redirectAfterAuth?: string;
}

function resolveRedirectAfterAuth(returnTo: string | null, fallback = "/dashboard") {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return fallback;
}

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(
    searchParams.get("returnTo"),
    redirectAfterAuth,
  );
  const [step, setStep] = useState<"signIn" | { email: string }>("signIn");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(redirect);
    }
  }, [authLoading, isAuthenticated, navigate, redirect]);

  const handleEmailSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);
      setStep({ email: formData.get("email") as string });
      setIsLoading(false);
    } catch (error) {
      console.error("Email sign-in error:", error);
      setError(
        error instanceof Error
          ? error.message
          : "Failed to send verification code. Please try again.",
      );
      setIsLoading(false);
    }
  };

  const handleOtpSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);
      navigate(redirect);
    } catch (error) {
      console.error("OTP verification error:", error);
      setError("The verification code you entered is incorrect.");
      setIsLoading(false);
      setOtp("");
    }
  };

  const handleGuestLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await signIn("anonymous");
      navigate(redirect);
    } catch (error) {
      console.error("Guest login error:", error);
      setError(
        `Failed to sign in as guest: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      setIsLoading(false);
    }
  };

  return (
    <div className="nb-grid flex min-h-screen flex-col bg-background">
      <header className="border-b-4 border-foreground">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-4">
          <div className="nb-border-4 nb-shadow-sm flex size-10 items-center justify-center bg-primary">
            <Bot className="size-6 text-primary-foreground" />
          </div>
          <div>
            <div className="font-mono text-base leading-none font-black tracking-tight">
              SWARMGRID
            </div>
            <div className="font-mono text-[9px] font-bold tracking-[0.2em] uppercase opacity-60">
              Edge Fleet Coordination
            </div>
          </div>
          <Button
            variant="outline"
            className="nb-border nb-press-sm ml-auto h-9 bg-white px-4 font-mono text-xs font-bold hover:bg-muted"
            onClick={() => navigate("/")}
          >
            ← HOME
          </Button>
        </div>
      </header>

      <div className="flex flex-1 items-center justify-center p-4">
        <Card className="nb-border-4 nb-shadow-lg w-full max-w-md bg-card">
          {step === "signIn" ? (
            <>
              <CardHeader className="border-b-4 border-foreground">
                <div className="nb-border-4 mb-3 flex size-12 items-center justify-center bg-accent">
                  <Bot className="size-6" />
                </div>
                <CardTitle className="font-mono text-xl font-black tracking-tight">
                  OPERATOR ACCESS
                </CardTitle>
                <CardDescription className="font-medium">
                  Sign in to run the fleet simulation. Each AMR is its own edge node — you're just
                  the observer.
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleEmailSubmit}>
                <CardContent className="pt-5">
                  <label className="mb-1.5 block font-mono text-[10px] font-bold tracking-wider uppercase opacity-60">
                    Email
                  </label>
                  <div className="relative flex items-center gap-2">
                    <div className="relative flex-1">
                      <Mail className="absolute top-3 left-3 h-4 w-4 opacity-60" />
                      <Input
                        name="email"
                        placeholder="name@example.com"
                        type="email"
                        className="nb-border h-10 bg-white pl-9 font-mono font-bold"
                        disabled={isLoading}
                        required
                      />
                    </div>
                    <Button
                      type="submit"
                      className="nb-border nb-press-sm h-10 bg-primary px-4 font-mono font-black text-primary-foreground hover:bg-primary/90"
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ArrowRight className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  {error && (
                    <p className="nb-border mt-3 bg-[#ff4d2e] px-3 py-2 font-mono text-xs font-bold text-white">
                      {error}
                    </p>
                  )}
                  <div className="mt-5">
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t-2 border-foreground/20" />
                      </div>
                      <div className="relative flex justify-center">
                        <span className="bg-card px-2 font-mono text-[10px] font-bold tracking-widest uppercase opacity-60">
                          or
                        </span>
                      </div>
                    </div>
                    <Button
                      type="button"
                      className="nb-border nb-press mt-4 h-10 w-full bg-accent font-mono text-sm font-black text-foreground hover:bg-accent/80"
                      onClick={handleGuestLogin}
                      disabled={isLoading}
                    >
                      <UserX className="mr-2 h-4 w-4" />
                      CONTINUE AS GUEST
                    </Button>
                  </div>
                </CardContent>
              </form>
            </>
          ) : (
            <>
              <CardHeader className="border-b-4 border-foreground">
                <CardTitle className="font-mono text-xl font-black tracking-tight">
                  CODE CHECK
                </CardTitle>
                <CardDescription className="font-medium">
                  We sent a 6-digit code to <span className="font-bold">{step.email}</span>
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleOtpSubmit}>
                <CardContent className="pt-5">
                  <input type="hidden" name="email" value={step.email} />
                  <input type="hidden" name="code" value={otp} />
                  <div className="flex justify-center">
                    <InputOTP
                      value={otp}
                      onChange={setOtp}
                      maxLength={6}
                      disabled={isLoading}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && otp.length === 6 && !isLoading) {
                          const form = (e.target as HTMLElement).closest("form");
                          if (form) {
                            form.requestSubmit();
                          }
                        }
                      }}
                    >
                      <InputOTPGroup>
                        {Array.from({ length: 6 }).map((_, index) => (
                          <InputOTPSlot key={index} index={index} />
                        ))}
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                  {error && (
                    <p className="nb-border mt-3 bg-[#ff4d2e] px-3 py-2 text-center font-mono text-xs font-bold text-white">
                      {error}
                    </p>
                  )}
                  <p className="mt-4 text-center font-mono text-xs font-bold">
                    Didn't receive a code?{" "}
                    <button
                      type="button"
                      className="underline underline-offset-2 hover:opacity-70"
                      onClick={() => setStep("signIn")}
                    >
                      Try again
                    </button>
                  </p>
                </CardContent>
                <CardFooter className="flex-col gap-2 pb-6">
                  <Button
                    type="submit"
                    className="nb-border nb-press h-11 w-full bg-primary font-mono text-sm font-black text-primary-foreground hover:bg-primary/90"
                    disabled={isLoading || otp.length !== 6}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        VERIFYING…
                      </>
                    ) : (
                      <>
                        VERIFY CODE <ArrowRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="nb-border h-10 w-full bg-white font-mono text-xs font-bold hover:bg-muted"
                    onClick={() => setStep("signIn")}
                    disabled={isLoading}
                  >
                    USE DIFFERENT EMAIL
                  </Button>
                </CardFooter>
              </form>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

export default function AuthPage(props: AuthProps) {
  return (
    <Suspense>
      <Auth {...props} />
    </Suspense>
  );
}
