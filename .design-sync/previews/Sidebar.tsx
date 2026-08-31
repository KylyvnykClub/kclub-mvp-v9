import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "kclub";

export function ConsoleShell() {
  return (
    <SidebarProvider style={{ minHeight: 480 }}>
      <Sidebar collapsible="none">
        <SidebarHeader>
          <div style={{ padding: 8, fontWeight: 800, letterSpacing: "0.14em" }}>
            KCLUB
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Management</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive>Members</SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton>Companies</SidebarMenuButton>
                  <SidebarMenuBadge>4</SidebarMenuBadge>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton>Introductions</SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <div style={{ padding: 8, fontSize: 12, opacity: 0.7 }}>
            staff_admin
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <div
          style={{ padding: 16, display: "flex", gap: 8, alignItems: "center" }}
        >
          <SidebarTrigger />
          <span style={{ fontWeight: 700 }}>Members</span>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
