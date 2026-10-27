import type { ClassDef, ClassRegistry } from './node.ts'
import { GhostDef } from './classes/ghost.ts'
import { EntRecordDataDef } from './classes/ent-record-data.ts'

export function createRegistry(): ClassRegistry {
  const registry: ClassRegistry = new Map()
  for (const def of [GhostDef, EntRecordDataDef] as ClassDef<unknown>[]) {
    registry.set(def.classId, def)
  }
  return registry
}
