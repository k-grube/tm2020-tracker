import { fileLabel } from '../files.ts'

export interface TabEntry {
  name: string
  nickname: string
  raceTimeMs: number | null
  status: 'ok' | 'warn' | 'review' | 'error'
}

export type TabSort = 'name' | 'time'

// green nothing fired, amber something fired below review, red needs review, gray did not parse
const DOT = {
  ok: 'bg-green-600',
  warn: 'bg-amber-500',
  review: 'bg-red-600',
  error: 'bg-zinc-400',
} as const

const TAB = 'group flex items-center gap-1 rounded-md border px-2 py-1 text-sm'
const TAB_ON = `${TAB} border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900`
const TAB_OFF = `${TAB} border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800`
const SMALL =
  'rounded-md border border-zinc-300 px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800'
const SMALL_ON = `${SMALL} bg-zinc-200 dark:bg-zinc-700`

function order(entries: TabEntry[], sort: TabSort): { e: TabEntry; i: number }[] {
  const byName = (a: TabEntry, b: TabEntry) =>
    fileLabel(a).toLowerCase().localeCompare(fileLabel(b).toLowerCase())
  const byTime = (a: TabEntry, b: TabEntry) =>
    (a.raceTimeMs ?? Infinity) - (b.raceTimeMs ?? Infinity) || byName(a, b)
  return entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (sort === 'time' ? byTime(a.e, b.e) : byName(a.e, b.e)))
}

export function FileTabs({
  entries,
  selected,
  sort,
  onSort,
  onSelect,
  onRemove,
  onClear,
}: {
  entries: TabEntry[]
  selected: number
  sort: TabSort
  onSort: (sort: TabSort) => void
  onSelect: (index: number) => void
  onRemove: (index: number) => void
  onClear: () => void
}) {
  if (entries.length === 0) {
    return null
  }
  return (
    <div className="mt-6 flex flex-wrap items-center gap-2" role="tablist">
      {entries.length > 1 &&
        (['name', 'time'] as const).map((s) => (
          <button
            key={s}
            type="button"
            className={s === sort ? SMALL_ON : SMALL}
            aria-pressed={s === sort}
            onClick={() => onSort(s)}
          >
            {s}
          </button>
        ))}
      {order(entries, sort).map(({ e, i }) => (
        <span key={`${i}-${e.name}`} className={i === selected ? TAB_ON : TAB_OFF}>
          <span
            className={`inline-block h-2 w-2 rounded-full ${DOT[e.status]}`}
            aria-hidden="true"
          />
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
      <button type="button" className={SMALL} onClick={onClear}>
        clear all
      </button>
    </div>
  )
}
