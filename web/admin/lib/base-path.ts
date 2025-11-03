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
  const normalizedPath = ensureLeadingSlash(path)
  if (!normalizedBasePath) {
    return normalizedPath
  }
  return `${normalizedBasePath}${normalizedPath}`
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
