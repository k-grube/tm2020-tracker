import { useState, type DragEvent } from 'react'

export function DropZone({ onFiles, busy }: { onFiles: (files: File[]) => void; busy: boolean }) {
  const [over, setOver] = useState(false)
  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    setOver(false)
    onFiles(Array.from(e.dataTransfer.files))
  }
  return (
    <label
      className={`dropzone${over ? ' over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <input
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
