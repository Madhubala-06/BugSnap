import { Suspense } from "react"
import { Toaster } from "sonner"
import { AuthGate } from "@/components/auth-gate"
import { AppSidebar } from "@/components/shell/app-sidebar"
import { TopBar } from "@/components/shell/top-bar"
import { WorkspaceDataProvider } from "@/components/shell/workspace-data"
import { NewProjectDialog } from "@/components/shell/new-project-dialog"
import { TooltipProvider } from "@/components/kit/tooltip"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <WorkspaceDataProvider>
        <TooltipProvider>
          <div className="flex h-screen bg-background">
            <Suspense>
              <AppSidebar />
            </Suspense>
            <div className="flex min-w-0 flex-1 flex-col">
              <TopBar />
              <main className="min-h-0 flex-1 overflow-auto">{children}</main>
            </div>
          </div>
          <NewProjectDialog />
          <Toaster
            position="bottom-right"
            theme="system"
            toastOptions={{ className: "!bg-card !border-border !text-foreground" }}
          />
        </TooltipProvider>
      </WorkspaceDataProvider>
    </AuthGate>
  )
}
