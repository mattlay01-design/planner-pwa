import { useRef } from 'react'

interface EditInputProps {
  className: string
  value: string
  onChange: (value: string) => void
  onCommit: () => void
  onCancel: () => void
  placeholder?: string
  disabled?: boolean
}

// Inline edit field with exactly one outcome per mount. Enter and blur both commit, and
// Escape cancels — but closing the field unmounts it, and some browsers then fire blur
// too, which would commit a second time (a duplicate add) or commit after Escape. The ref
// lets only the first of those events through.
export function EditInput({ onChange, onCommit, onCancel, ...rest }: EditInputProps) {
  const finished = useRef(false)

  function finish(commit: boolean) {
    if (finished.current) return
    finished.current = true
    if (commit) onCommit()
    else onCancel()
  }

  return (
    <input
      {...rest}
      autoFocus
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(true)
        if (e.key === 'Escape') finish(false)
      }}
    />
  )
}
