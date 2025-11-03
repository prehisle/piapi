const rawBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

const normalizedBasePath = (() => {
  if (!rawBasePath) {
    return ''
  }
  let base = rawBasePath
  if (!base.startsWith('/')) {
    base = `/${base}`
  }
  base = base.replace(/\/+$/, '')
  if (base === '/' || base === '') {
    return ''
  }
  return base
})()

const ensureLeadingSlash = (path: string) => (path.startsWith('/') ? path : `/${path}`)

export function getBasePath(): string {
  return normalizedBasePath
}

export function withBasePath(path: string): string {
  // Note: Next.js basePath config automatically handles prefixing for
  // Link components and router.push(), so we just return the original path.
  // API requests should use hardcoded paths (e.g., '/piadmin/api').
  const normalizedPath = ensureLeadingSlash(path)
  return normalizedPath
}

export function stripBasePath(path: string): string {
  if (!normalizedBasePath) {
    return path || '/'
  }
  if (path === normalizedBasePath) {
    return '/'
  }
  if (path.startsWith(`${normalizedBasePath}/`)) {
    const stripped = path.slice(normalizedBasePath.length)
    return stripped.startsWith('/') ? stripped : `/${stripped}`
  }
  return path
}
