import {
  Card,
  CardContent,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "kclub";

export function ProfileTabs() {
  return (
    <Tabs defaultValue="profile" style={{ maxWidth: 420 }}>
      <TabsList>
        <TabsTrigger value="profile">Profile</TabsTrigger>
        <TabsTrigger value="company">Company</TabsTrigger>
        <TabsTrigger value="billing">Billing</TabsTrigger>
      </TabsList>
      <TabsContent value="profile">
        <Card>
          <CardContent style={{ paddingTop: 24 }}>
            Display name, language, and country live here.
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
