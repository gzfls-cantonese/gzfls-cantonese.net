/**
 * Storage backend abstraction.
 *  - oss: presigned PUT/GET URLs + authenticated DELETE against Aliyun OSS.
 *  - local: files on disk; the function itself accepts the presigned "upload"
 *    PUT at /local-put/<key>, so the whole flow runs without cloud credentials.
 *
 * Reading is asymmetric on purpose: the oss backend hands out a short-lived
 * presigned GET URL so a third party (the ASR service) can fetch the audio
 * directly, and never relays object bytes through the function. Only the local
 * backend reads bytes, since there is no public URL to hand out.
 */
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { deleteObject, headObject, presignGetUrl, presignPutUrl } from './oss.mjs'

/** Every key this function touches must live under the configured prefix. */
export function assertUnderPrefix(cfg, key) {
  if (typeof key !== 'string' || !key.startsWith(`${cfg.prefix}/`)) {
    throw new Error('forbidden key')
  }
  // A key like `recordings/../../etc/passwd` satisfies the prefix check but
  // escapes the storage root once joined to it, so reject traversal segments.
  if (key.split('/').some((seg) => seg === '' || seg === '.' || seg === '..')) {
    throw new Error('forbidden key')
  }
}

export function createBackend(cfg) {
  if (cfg.backend === 'oss') {
    return {
      kind: 'oss',
      putPresign(key, ttlSec, contentType) {
        return presignPutUrl(cfg, key, ttlSec, contentType)
      },
      getPresign(key, ttlSec) {
        assertUnderPrefix(cfg, key)
        return presignGetUrl(cfg, key, ttlSec)
      },
      exists(key) {
        assertUnderPrefix(cfg, key)
        return headObject(cfg, key)
      },
      async delete(key) {
        assertUnderPrefix(cfg, key)
        const status = await deleteObject(cfg, key)
        return status === 204 || status === 404
      },
    }
  }
  const root = path.resolve(cfg.localDir)
  const resolveLocal = (key) => {
    const file = path.resolve(root, key)
    if (!file.startsWith(root + path.sep)) throw new Error('forbidden key')
    return file
  }
  return {
    kind: 'local',
    putPresign(key, ttlSec, contentType) {
      void ttlSec
      void contentType
      return `/local-put/${key}`
    },
    getPresign(key) {
      assertUnderPrefix(cfg, key)
      throw new Error('local backend cannot produce a publicly reachable URL')
    },
    async getObject(key) {
      assertUnderPrefix(cfg, key)
      return readFile(resolveLocal(key))
    },
    async exists(key) {
      try {
        await access(resolveLocal(key))
        return true
      } catch {
        return false
      }
    },
    async delete(key) {
      try {
        await rm(resolveLocal(key), { force: false })
        return true
      } catch (err) {
        if (err.code === 'ENOENT') return false
        throw err
      }
    },
    async localPut(key, body) {
      const file = resolveLocal(key)
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(file, body)
    },
  }
}
