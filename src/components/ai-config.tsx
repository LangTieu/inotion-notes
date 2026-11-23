"use client"

import { useCallback, useEffect, useState } from "react"

export type AiConfig = {
  baseUrl: string
  model: string
  apiKey: string
}

export const AI_CONFIG_STORAGE_KEY = "inotion.ai.config.v1"

export const DEFAULT_AI_CONFIG: AiConfig = {
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  apiKey: "",
}

export function isAiConfigured(config: AiConfig) {
  return Boolean(config.baseUrl.trim() && config.model.trim() && config.apiKey.trim())
}

export function useAiConfig() {
  const [config, setConfigState] = useState<AiConfig>(DEFAULT_AI_CONFIG)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(AI_CONFIG_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AiConfig>
        setConfigState({ ...DEFAULT_AI_CONFIG, ...parsed })
      }
    } catch {
      // Corrupt entry: fall back to defaults.
    }
    setLoaded(true)
  }, [])

  const setConfig = useCallback((next: AiConfig) => {
    setConfigState(next)
    try {
      window.localStorage.setItem(AI_CONFIG_STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Storage may be unavailable (private mode); keep in-memory value.
    }
  }, [])

  const clearConfig = useCallback(() => {
    setConfigState(DEFAULT_AI_CONFIG)
    try {
      window.localStorage.removeItem(AI_CONFIG_STORAGE_KEY)
    } catch {
      // ignore
    }
  }, [])

  return { config, setConfig, clearConfig, loaded }
}
