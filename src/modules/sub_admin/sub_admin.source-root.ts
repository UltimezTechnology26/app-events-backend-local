// Finds the project root that holds the ORIGINAL source files the Manager Roles
// refresh reads (it sends a module's real permission-check lines to the AI).
//
// It can't just go "three folders up from this file": locally the backend runs
// from source (ts-node), but the staging Docker image compiles to dist/ and
// runs `node dist/index.js`, so this file then lives under dist/ - where only
// compiled .js exists and the .ts sources the refresh needs are missing. The
// Dockerfile's `COPY . .` still puts the full source at the image root, so we
// walk up until we find this module's own .ts file.
import fs from 'fs'
import path from 'path'

/** A file that only exists in the source tree, never in the compiled dist/ output. */
export const SOURCE_ROOT_MARKER = path.join('src', 'modules', 'sub_admin', 'sub_admin_access_type.service.ts')

export function findSourceRoot(startDir: string = __dirname): string | null {
  let dir = path.resolve(startDir)
  for (;;) {
    if (fs.existsSync(path.join(dir, SOURCE_ROOT_MARKER))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}
