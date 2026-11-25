import { del, list } from "@vercel/blob"

/** Delete every stored file of a workspace (recordings, screenshots) under w/<id>/. */
export async function deleteWorkspaceFiles(workspaceId: string) {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) return 0
  let cursor: string | undefined
  let removed = 0
  do {
    const page = await list({ prefix: `w/${workspaceId}/`, cursor, limit: 1000, token })
    if (page.blobs.length) {
      await del(page.blobs.map((b) => b.url), { token })
      removed += page.blobs.length
    }
    cursor = page.hasMore ? page.cursor : undefined
  } while (cursor)
  return removed
}
