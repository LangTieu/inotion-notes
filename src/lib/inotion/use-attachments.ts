'use client'

import { useCallback, useEffect, useState } from 'react'
import useSWR from 'swr'
import {
  ApiError,
  deleteAttachment,
  listAttachments,
  uploadAttachment,
  uploadLargeAttachment,
} from './api'
import { formatBytes } from './format'
import { MAX_ATTACHMENT_BYTES, type Attachment, type Id } from './types'

function uploadErrorMessage(file: File, error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 413) {
      return `"${file.name}" is too large. Each note can hold up to ${formatBytes(MAX_ATTACHMENT_BYTES)} of attachments.`
    }
    if ([400, 415, 422].includes(error.status)) {
      return `"${file.name}" was rejected: ${error.message}`
    }
    return `"${file.name}": ${error.message}`
  }
  return `"${file.name}" could not be uploaded.`
}

export function useAttachments(
  noteId: Id,
  onCountChange?: (noteId: Id, count: number) => void,
) {
  const swr = useSWR<Attachment[]>(
    ['attachments', String(noteId)],
    () => listAttachments(noteId),
    { revalidateOnFocus: false, shouldRetryOnError: false },
  )
  const { data, mutate } = swr
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [uploadProgress,setUploadProgress] = useState<{filename:string;loaded:number;total:number}|null>(null)

  useEffect(() => {
    if (data) onCountChange?.(noteId, data.length)
  }, [data, noteId, onCountChange])

  const totalBytes = (data ?? []).reduce((sum, a) => sum + a.byte_size, 0)

  const upload = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return
      setUploading(true)
      setUploadError(null)
      let used = totalBytes
      const errors: string[] = []
      for (const file of files) {
        if (file.size > 50 * 1024 * 1024 || used + file.size > MAX_ATTACHMENT_BYTES) {
          errors.push(
            `"${file.name}" (${formatBytes(file.size)}) would exceed the ${formatBytes(MAX_ATTACHMENT_BYTES)} limit for this note.`,
          )
          continue
        }
        try {
          const result = file.size > 25 * 1024 * 1024
            ? await uploadLargeAttachment(noteId,file,(loaded,total)=>setUploadProgress({filename:file.name,loaded,total}))
            : await uploadAttachment(noteId, file)
          used += file.size
          if (result.warning) setWarning(result.warning)
          await mutate()
        } catch (e) {
          errors.push(uploadErrorMessage(file, e))
        }
      }
      setUploadError(errors.length ? errors.join('\n') : null)
      setUploadProgress(null)
      setUploading(false)
    },
    [noteId, totalBytes, mutate],
  )

  const remove = useCallback(
    async (id: Id) => {
      setRemoveError(null)
      try {
        await deleteAttachment(id)
        await mutate()
      } catch (e) {
        const message =
          e instanceof Error ? e.message : 'Could not delete the attachment.'
        setRemoveError(message)
        throw e
      }
    },
    [mutate],
  )

  return {
    attachments: data,
    isLoading: swr.isLoading,
    error: swr.error ? (swr.error as Error).message : null,
    retry: () => void mutate(),
    totalBytes,
    uploading,
    uploadProgress,
    uploadError,
    clearUploadError: () => setUploadError(null),
    warning,
    dismissWarning: () => setWarning(null),
    removeError,
    upload,
    remove,
  }
}
