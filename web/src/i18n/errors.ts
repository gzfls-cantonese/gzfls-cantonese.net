import { DataError } from '../data/api'
import type { TrialErrorReason } from '../data/useTrialRecord'
import type { Translator } from './messages'

/**
 * Resolves a load failure to visitor-facing text at render time. Because the
 * reason travels as a code rather than a pre-formatted string, a message already
 * on screen re-translates when the locale changes.
 */
export function describeDataError(error: unknown, t: Translator): string {
  if (error instanceof DataError) {
    switch (error.reason) {
      case 'network':
        return t('error.reason.network')
      case 'http':
        return t('error.reason.http', { status: error.status })
      case 'parse':
        return t('error.reason.parse')
      case 'invalidEpisode':
        return t('error.reason.invalidEpisode')
    }
  }
  return t('error.reason.unexpected')
}

/** Same contract for the trial recorder's scoring and capture failures. */
export function describeTrialError(reason: TrialErrorReason, t: Translator): string {
  switch (reason) {
    case 'scoringUnavailable':
      return t('trial.error.scoringUnavailable')
    case 'rateLimited':
      return t('trial.error.rateLimited')
    case 'destroyed':
      return t('trial.error.destroyed')
    case 'timeout':
      return t('trial.error.timeout')
    case 'unknown':
      return t('trial.error.unknown')
    case 'unsupportedFormat':
      return t('trial.error.unsupportedFormat')
    case 'micDenied':
      return t('trial.error.micDenied')
  }
}
