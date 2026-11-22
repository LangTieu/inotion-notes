
import { useMemo } from 'react'
import { encodeQr } from '@/utils/qr'
import { cn } from '@/lib/utils'

const QUIET_ZONE = 4

interface QrSvgProps {
  value: string
  label?: string
  className?: string
}

/** Renders a QR code as a single SVG path. Black on white is required for scanners. */
export function QrSvg({
  value,
  label = 'QR code',
  className,
}: QrSvgProps) {
  const modules = useMemo(() => {
    try {
      return encodeQr(value)
    } catch {
      return null
    }
  }, [value])

  if (!modules) {
    return (
      <p role="alert" className="text-sm text-red-700">
        Could not draw the QR code. Use the manual key instead.
      </p>
    )
  }

  const size = modules.length + QUIET_ZONE * 2
  let path = ''
  modules.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) path += `M${x + QUIET_ZONE} ${y + QUIET_ZONE}h1v1h-1z`
    })
  })

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className={cn('rounded-md border border-border', className)}
    >
      <rect width={size} height={size} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  )
}
