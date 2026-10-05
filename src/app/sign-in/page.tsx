import { redirect } from "next/navigation";
import { SignInForm } from "@/components/sign-in-form";
import { Shell } from "@/components/shell";
import { getOptionalUser } from "@/lib/user";

export default async function SignInPage() {
  const user = await getOptionalUser();
  if (user) {
    redirect("/");
  }

  return (
    <Shell>
      <div className="mx-auto max-w-md py-16">
        <h1 className="text-[32px] leading-tight">Daily Fit</h1>
        <p className="mt-3 max-w-[42ch] text-[14px] leading-[22px] text-mute">
          Your number is the account. We text a code, then your closet follows you.
        </p>
        <div className="mt-10">
          <SignInForm />
        </div>
      </div>
    </Shell>
  );
}
