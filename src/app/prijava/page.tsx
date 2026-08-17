import { Card } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="min-h-dvh grid place-items-center px-5">
      <div className="w-full max-w-[380px]">
        <div className="text-center mb-7">
          <p className="font-bold text-lg tracking-[-0.01em]">
            Colnix<span className="text-wine">.</span>
          </p>
          <p className="text-[13px] text-ink-muted mt-1">Naročila, dostava in računi</p>
        </div>
        <Card className="p-5 shadow-card">
          <LoginForm />
        </Card>
      </div>
    </div>
  );
}
