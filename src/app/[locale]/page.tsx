import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/theme-toggle";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <HomeContent />;
}

function HomeContent() {
  const t = useTranslations("home");
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-between items-center w-full">
            <Badge variant="outline" className="border-accent text-accent">
              MVP v9
            </Badge>
            <ThemeToggle />
          </div>
          <CardTitle className="text-3xl font-serif">{t("title")}</CardTitle>
          <CardDescription className="font-sans text-muted-foreground">
            {t("subtitle")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Separator />
          <div className="pt-4 space-y-2 text-sm">
            <p>
              <strong>Fonts:</strong> Playfair Display & Inter
            </p>
            <p>
              <strong>Design:</strong> Tailwind v4 + shadcn/ui
            </p>
            <p>
              <strong>Tokens:</strong> Custom OKLCH Colors (Gold Accent)
            </p>
          </div>
        </CardContent>
        <CardFooter>
          <Button className="w-full font-serif text-lg">Enter Club</Button>
        </CardFooter>
      </Card>
    </main>
  );
}
