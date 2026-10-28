import { useState, type DragEvent } from 'react'

export function DropZone({ onFiles, busy }: { onFiles: (files: File[]) => void; busy: boolean }) {
  const [over, setOver] = useState(false)
  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    setOver(false)
    onFiles(Array.from(e.dataTransfer.files))
  }
  const border = over
    ? 'border-blue-500 text-zinc-900 dark:text-zinc-100'
    : 'border-zinc-300 text-zinc-500 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500'
  return (
    <label
      className={`mt-4 block cursor-pointer rounded-lg border-2 border-dashed p-9 text-center text-sm ${border}`}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <input
        className="hidden"
        type="file"
        multiple
        accept=".gbx,.Gbx"
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []))
          e.target.value = ''
        }}
      />
      <span>{busy ? 'analyzing' : 'drop Ghost.Gbx or Replay.Gbx, or click'}</span>
    </label>
  )
}
