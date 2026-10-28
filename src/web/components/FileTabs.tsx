import { fileLabel } from '../files.ts'

export interface TabEntry {
  name: string
  nickname: string
  raceTimeMs: number | null
  needsHumanReview: boolean
}

const TAB = 'group flex items-center gap-1 rounded-md border px-2 py-1 text-sm'
const TAB_ON = `${TAB} border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900`
const TAB_OFF = `${TAB} border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800`

export function FileTabs({
  entries,
  selected,
  onSelect,
  onRemove,
  onClear,
}: {
  entries: TabEntry[]
  selected: number
  onSelect: (index: number) => void
  onRemove: (index: number) => void
  onClear: () => void
}) {
  if (entries.length === 0) {
    return null
  }
  return (
    <div className="mt-6 flex flex-wrap items-center gap-2" role="tablist">
      {entries
        .map((e, i) => ({ e, i }))
        .sort((a, b) => fileLabel(a.e).toLowerCase().localeCompare(fileLabel(b.e).toLowerCase()))
        .map(({ e, i }) => (
          <span key={`${i}-${e.name}`} className={i === selected ? TAB_ON : TAB_OFF}>
            {e.needsHumanReview && (
              <span className="inline-block h-2 w-2 rounded-full bg-red-600" aria-hidden="true" />
            )}
            <button
              type="button"
              role="tab"
              aria-selected={i === selected}
              title={e.name}
              onClick={() => onSelect(i)}
            >
              {fileLabel(e)}
            </button>
            <button
              type="button"
              className="ml-1 opacity-50 hover:opacity-100"
              aria-label={`remove ${e.name}`}
              onClick={() => onRemove(i)}
            >
              x
            </button>
          </span>
        ))}
      <button
        type="button"
        className="rounded-md border border-zinc-300 px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
        onClick={onClear}
      >
        clear all
      </button>
    </div>
  )
}
