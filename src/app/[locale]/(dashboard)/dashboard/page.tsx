import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ locale: string }>;
};

/**
 * The member home lives at /dashboard/profile. The bare /dashboard route exists
 * only as the target of the authorization-failure fallback that the admin pages
 * redirect to (redirect(`/${locale}/dashboard`)). Without a page here that
 * fallback lands on a 404; this forwards it to the real member landing. The
 * surrounding (dashboard) layout has already guaranteed an authenticated
 * member, so there is nothing to guard here.
 */
export default async function DashboardIndexPage({ params }: Props) {
  const { locale } = await params;
  redirect(`/${locale}/dashboard/profile`);
}
