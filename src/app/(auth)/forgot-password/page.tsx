import { AuthForm } from "@/components/shell/auth-form";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; intent?: string; error?: string }>;
}) {
  const { next, intent, error } = await searchParams;
  return (
    <AuthForm
      screen="forgot-password"
      next={next}
      intent={intent}
      invalid={error}
    />
  );
}
