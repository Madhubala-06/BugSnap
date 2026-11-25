"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"
import { listMembers, listProjects, type Member, type Project } from "@/lib/api"

export interface Crumb {
  label: string
  href?: string
  mono?: boolean
}

interface WorkspaceData {
  members: Member[]
  projects: Project[]
  refreshProjects: () => Promise<void>
  crumbs: Crumb[]
  setCrumbs: (c: Crumb[]) => void
  newProjectOpen: boolean
  setNewProjectOpen: (o: boolean) => void
}

const Ctx = createContext<WorkspaceData>({
  members: [],
  projects: [],
  refreshProjects: async () => undefined,
  crumbs: [],
  setCrumbs: () => undefined,
  newProjectOpen: false,
  setNewProjectOpen: () => undefined,
})

export const useWorkspace = () => useContext(Ctx)

/** Members, projects and breadcrumbs, shared by the whole dashboard. */
export function WorkspaceDataProvider({ children }: { children: React.ReactNode }) {
  const [members, setMembers] = useState<Member[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [crumbs, setCrumbs] = useState<Crumb[]>([])
  const [newProjectOpen, setNewProjectOpen] = useState(false)

  const refreshProjects = useCallback(async () => {
    setProjects(await listProjects().catch(() => []))
  }, [])

  useEffect(() => {
    listMembers()
      .then(setMembers)
      .catch(() => undefined)
    refreshProjects()
  }, [refreshProjects])

  return <Ctx.Provider value={{ members, projects, refreshProjects, crumbs, setCrumbs, newProjectOpen, setNewProjectOpen }}>{children}</Ctx.Provider>
}

/** Pages call this to set the breadcrumb trail in the top bar. */
export function useCrumbs(crumbs: Crumb[]) {
  const { setCrumbs } = useWorkspace()
  const key = JSON.stringify(crumbs)
  useEffect(() => {
    setCrumbs(JSON.parse(key))
  }, [key, setCrumbs])
}
