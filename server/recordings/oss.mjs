/**
 * Aliyun OSS V1 signing (presigned PUT/GET + authenticated DELETE).
 * Only the minimal surface needed by the recordings function.
 */
import { createHmac } from 'node:crypto'

function sign(secret, stringToSign) {
  return createHmac('sha1', secret).update(stringToSign, 'utf8').digest('base64')
}

function hostOf(cfg) {
  return `${cfg.bucket}.${cfg.endpoint}`
}

/** Presigned PUT URL (V1 signature in the query string). */
export function presignPutUrl(cfg, key, expiresSec, contentType) {
  const expires = Math.floor(Date.now() / 1000) + expiresSec
  const resource = `/${cfg.bucket}/${key}`
  const stringToSign = ['PUT', '', contentType || '', String(expires), resource].join('\n')
  const signature = sign(cfg.accessKeySecret, stringToSign)
  const q = new URLSearchParams({
    OSSAccessKeyId: cfg.accessKeyId,
    Expires: String(expires),
    Signature: signature,
  })
  return `https://${hostOf(cfg)}/${key}?${q.toString()}`
}

/**
 * Presigned GET URL — hands a third party (the ASR service) read access to one
 * private object without the function ever relaying its bytes.
 */
export function presignGetUrl(cfg, key, expiresSec) {
  const expires = Math.floor(Date.now() / 1000) + expiresSec
  const resource = `/${cfg.bucket}/${key}`
  const stringToSign = ['GET', '', '', String(expires), resource].join('\n')
  const signature = sign(cfg.accessKeySecret, stringToSign)
  const q = new URLSearchParams({
    OSSAccessKeyId: cfg.accessKeyId,
    Expires: String(expires),
    Signature: signature,
  })
  return `https://${hostOf(cfg)}/${key}?${q.toString()}`
}

/**
 * Authenticated HEAD — true when the object exists, false when it does not.
 * Lets /assess confirm ownership before paying for an ASR call, so a key rebuilt
 * under the caller's own prefix that simply is not there (another anon's recId,
 * or a recording already disposed) fails without touching the AI service.
 */
export async function headObject(cfg, key) {
  const date = new Date().toUTCString()
  const resource = `/${cfg.bucket}/${key}`
  const stringToSign = ['HEAD', '', '', date, resource].join('\n')
  const signature = sign(cfg.accessKeySecret, stringToSign)
  const res = await fetch(`https://${hostOf(cfg)}/${key}`, {
    method: 'HEAD',
    headers: {
      Date: date,
      Authorization: `OSS ${cfg.accessKeyId}:${signature}`,
    },
  })
  if (res.status === 200) return true
  if (res.status === 404) return false
  throw new Error(`HEAD ${key} failed (${res.status})`)
}

/** Authenticated DELETE of an object. Returns the response status. */
export async function deleteObject(cfg, key) {
  const date = new Date().toUTCString()
  const resource = `/${cfg.bucket}/${key}`
  const stringToSign = ['DELETE', '', '', date, resource].join('\n')
  const signature = sign(cfg.accessKeySecret, stringToSign)
  const res = await fetch(`https://${hostOf(cfg)}/${key}`, {
    method: 'DELETE',
    headers: {
      Date: date,
      Authorization: `OSS ${cfg.accessKeyId}:${signature}`,
    },
  })
  return res.status
}
