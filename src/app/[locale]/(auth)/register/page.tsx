import { setRequestLocale } from "next-intl/server";
import { RegisterFlow } from "./_components/register-flow";

export const metadata = {
  title: "Register - KCLUB",
};

export default async function RegisterPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <RegisterFlow />;
}
