export interface EpisodeSummary {
  episode: number
  title: string | null
  /** Arc (篇) id this episode belongs to. Optional: absent in older manifests. */
  arc?: number
  count: number
  totalDuration: number
  cover: string
  index: string
}

export interface Arc {
  id: number
  name: string
  subtitle: string
  title: string
  fromEpisode: number
  toEpisode: number
}

export interface Manifest {
  dataset: string
  source: string
  license: string
  licenseUrl: string
  episodeCount: number
  recordCount: number
  totalDuration: number
  /** Story arcs (篇) grouping the episodes. Optional: absent in older manifests. */
  arcs?: Arc[]
  episodes: EpisodeSummary[]
}

export interface ScriptEntry {
  id: string
  duration: number | null
  transcription: string
  /**
   * Per-code-point Jyutping aligned to `transcription` (same length as
   * Array.from(transcription)). Blank string for non-Han / unknown characters.
   * Optional: absent in assets built before the Jyutping pipeline existed.
   */
  jyutping?: string[]
  audio: string
}

export interface EpisodeIndex {
  episode: number
  count: number
  totalDuration: number
  entries: ScriptEntry[]
}
