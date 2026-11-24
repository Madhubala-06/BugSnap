"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Dialog, DialogContent } from "@/components/kit/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { createProject } from "@/lib/api"
import { useWorkspace } from "./workspace-data"

export function NewProjectDialog() {
  const router = useRouter()
  const { newProjectOpen, setNewProjectOpen, refreshProjects } = useWorkspace()
  const [name, setName] = useState("")
  const [hosts, setHosts] = useState("")
  const [busy, setBusy] = useState(false)

  return (
    <Dialog open={newProjectOpen} onOpenChange={setNewProjectOpen}>
      <DialogContent title="New project" description="A project is one website or app. Bugs recorded on its addresses go into it automatically.">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault()
            setBusy(true)
            try {
              const project = await createProject(
                name,
                hosts.split(/[\s,]+/).map((h) => h.trim()).filter(Boolean)
              )
              await refreshProjects()
              toast.success(`Project “${project.name}” created`)
              setNewProjectOpen(false)
              setName("")
              setHosts("")
              router.push(`/dashboard/reports?project=${project.id}`)
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Could not create the project")
            } finally {
              setBusy(false)
            }
          }}
        >
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Name</span>
            <Input autoFocus required value={name} onChange={(e) => setName(e.target.value)} placeholder="Web app" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Website addresses</span>
            <Input value={hosts} onChange={(e) => setHosts(e.target.value)} placeholder="app.acme.com, staging.acme.com, localhost:3000" />
            <span className="mt-1 block text-xs text-foreground-muted">Separate with commas. Existing bugs from these addresses are moved in too.</span>
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setNewProjectOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={busy || !name.trim()}>Create project</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
