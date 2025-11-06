/**
 * API client for piapi admin backend
 */

export interface ApiKey {
  [keyName: string]: string
}

export interface Service {
  type: string
  base_url: string
  auth?: {
    mode: string
    name: string
    prefix?: string
  }
}

export interface Provider {
  name: string
  api_keys: ApiKey
  services: Service[]
}

export interface UserServiceRoute {
  provider_name?: string
  provider_key_name?: string
  strategy?: string
  candidates?: UserServiceCandidate[]
}

export interface UserServiceCandidate {
  provider_name: string
  provider_key_name: string
  weight?: number
  enabled?: boolean
  tags?: string[]
}

export interface User {
  name: string
  api_key: string
  services: {
    [serviceType: string]: UserServiceRoute
  }
}

export interface CandidateRuntimeStatus {
  provider_name: string
  provider_key_name: string
  weight: number
  enabled: boolean
  healthy: boolean
  unhealthy_until?: string
  total_requests: number
  total_errors: number
  error_rate: number
  last_status: number
  last_error?: string
  last_updated?: string
  tags?: string[]
}

export interface Config {
  providers: Provider[]
  users: User[]
}

export interface RequestLogEntry {
  timestamp: string
  request_id: string
  user: string
  service_type: string
  provider: string
  provider_key: string
  method: string
  path: string
  upstream_url: string
  status_code: number
  latency_ms: number
  error?: string
}

export interface DashboardLogsResponse {
  logs: RequestLogEntry[]
  count: number
}

export interface DashboardStats {
  request_stats: {
    total_requests: number
    success_count: number
    error_count: number
    success_rate: number
    avg_latency_ms: number
    by_service: Record<string, { total: number; success: number; error: number }>
    by_provider: Record<string, { total: number; success: number; error: number }>
    by_user: Record<string, { total: number; success: number; error: number }>
  }
  providers: string[]
  users: string[]
  service_types: string[]
}

class ApiClient {
  private baseURL: string
  private token: string | null = null

  constructor() {
    // Base URL for admin API
    // Note: /piadmin/api is the actual backend path
    this.baseURL = '/piadmin/api'

    // Load token from localStorage if available
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('piapi_admin_token')
    }
  }

  setToken(token: string) {
    this.token = token
    if (typeof window !== 'undefined') {
      localStorage.setItem('piapi_admin_token', token)
    }
  }

  clearToken() {
    this.token = null
    if (typeof window !== 'undefined') {
      localStorage.removeItem('piapi_admin_token')
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers = new Headers(options.headers as HeadersInit)

    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`)
    }

    if (options.method && options.method !== 'GET' && options.body) {
      if (typeof options.body === 'string' && !headers.has('Content-Type')) {
        // Default to JSON for string bodies
        headers.set('Content-Type', 'application/json')
      }
    }

    const response = await fetch(`${this.baseURL}${endpoint}`, {
      ...options,
      headers,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(
        `API request failed: ${response.status} ${response.statusText}\n${errorText}`
      )
    }

    // Handle different content types
    const contentType = response.headers.get('Content-Type')
    if (contentType?.includes('application/json')) {
      return response.json()
    } else if (contentType?.includes('yaml')) {
      return response.text() as T
    } else {
      return response.text() as T
    }
  }

  /**
   * Get the complete configuration as structured JSON
   */
  async getConfig(): Promise<Config> {
    return this.request<Config>('/config')
  }

  /**
   * Get the raw YAML configuration
   */
  async getConfigRaw(): Promise<string> {
    return this.request<string>('/config/raw')
  }

  async getRouteStats(apiKey: string, service: string): Promise<CandidateRuntimeStatus[]> {
    const params = new URLSearchParams({ apiKey, service })
    return this.request<CandidateRuntimeStatus[]>(`/stats/routes?${params.toString()}`)
  }

  /**
   * Get dashboard logs with optional filters
   */
  async getDashboardLogs(options?: {
    provider?: string
    user?: string
    service?: string
    limit?: number
  }): Promise<DashboardLogsResponse> {
    const params = new URLSearchParams()
    if (options?.provider) params.set('provider', options.provider)
    if (options?.user) params.set('user', options.user)
    if (options?.service) params.set('service', options.service)
    if (options?.limit) params.set('limit', options.limit.toString())

    const queryString = params.toString()
    const endpoint = queryString ? `/dashboard/logs?${queryString}` : '/dashboard/logs'
    return this.request<DashboardLogsResponse>(endpoint)
  }

  /**
   * Get dashboard statistics
   */
  async getDashboardStats(): Promise<DashboardStats> {
    return this.request<DashboardStats>('/dashboard/stats')
  }

  /**
   * Update the configuration with raw YAML
   * This replaces the entire configuration atomically
   */
  async updateConfigRaw(yaml: string): Promise<void> {
    await this.request('/config/raw', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/x-yaml',
      },
      body: yaml,
    })
  }

  /**
   * Helper: Add a provider to the configuration
   * This fetches the current config, modifies it, converts to YAML, and updates
   */
  async addProvider(provider: Provider): Promise<void> {
    const config = await this.getConfig()
    // Handle null providers from empty config
    if (!config.providers) {
      config.providers = []
    }
    config.providers.push(provider)
    const yaml = this.configToYAML(config)
    await this.updateConfigRaw(yaml)
  }

  /**
   * Helper: Update a provider in the configuration
   */
  async updateProvider(oldName: string, provider: Provider): Promise<void> {
    const config = await this.getConfig()
    if (!config.providers) {
      throw new Error('No providers in configuration')
    }
    const index = config.providers.findIndex((p) => p.name === oldName)
    if (index === -1) {
      throw new Error(`Provider "${oldName}" not found`)
    }
    config.providers[index] = provider
    const yaml = this.configToYAML(config)
    await this.updateConfigRaw(yaml)
  }

  /**
   * Helper: Delete a provider from the configuration
   */
  async deleteProvider(name: string): Promise<void> {
    const config = await this.getConfig()
    if (!config.providers) {
      throw new Error('No providers to delete')
    }
    config.providers = config.providers.filter((p) => p.name !== name)
    const yaml = this.configToYAML(config)
    await this.updateConfigRaw(yaml)
  }

  /**
   * Helper: Add a user to the configuration
   */
  async addUser(user: User): Promise<void> {
    const config = await this.getConfig()
    if (!config.users) {
      config.users = []
    }
    const normalized: User = {
      ...user,
      services: user.services ?? {},
    }
    config.users.push(normalized)
    const yaml = this.configToYAML(config)
    await this.updateConfigRaw(yaml)
  }

  /**
   * Helper: Update a user in the configuration
   */
  async updateUser(oldName: string, user: User): Promise<void> {
    const config = await this.getConfig()
    if (!config.users) {
      throw new Error('No users in configuration')
    }
    const index = config.users.findIndex((u) => u.name === oldName)
    if (index === -1) {
      throw new Error(`User "${oldName}" not found`)
    }
    const normalized: User = {
      ...user,
      services: user.services ?? {},
    }
    config.users[index] = normalized
    const yaml = this.configToYAML(config)
    await this.updateConfigRaw(yaml)
  }

  /**
   * Helper: Delete a user from the configuration
   */
  async deleteUser(name: string): Promise<void> {
    const config = await this.getConfig()
    if (!config.users) {
      throw new Error('No users to delete')
    }
    config.users = config.users.filter((u) => u.name !== name)
    const yaml = this.configToYAML(config)
    await this.updateConfigRaw(yaml)
  }

  /**
   * Convert Config object to YAML string
   * Basic implementation - you may want to use a proper YAML library like js-yaml
   */
  private configToYAML(config: Config): string {
    let yaml = ''

    // Providers section
    if (config.providers && config.providers.length > 0) {
      yaml += 'providers:\n'
      for (const provider of config.providers) {
        yaml += `    - name: ${provider.name}\n`
        yaml += `      apiKeys:\n`
        for (const [keyName, keyValue] of Object.entries(provider.api_keys)) {
          yaml += `        ${keyName}: ${keyValue}\n`
        }
        if (provider.services && provider.services.length > 0) {
          yaml += `      services:\n`
          for (const service of provider.services) {
            yaml += `        - type: ${service.type}\n`
            yaml += `          baseUrl: ${service.base_url}\n`
            if (service.auth) {
              yaml += `          auth:\n`
              yaml += `            mode: ${service.auth.mode}\n`
              yaml += `            name: ${service.auth.name}\n`
              if (service.auth.prefix) {
                yaml += `            prefix: '${service.auth.prefix}'\n`
              }
            }
          }
        }
      }
    }

    // Users section
    if (config.users && config.users.length > 0) {
      yaml += 'users:\n'
      for (const user of config.users) {
        yaml += `    - name: ${user.name}\n`
        yaml += `      apiKey: ${user.api_key}\n`
        const services = user.services || {}
        if (Object.keys(services).length > 0) {
          yaml += `      services:\n`
          for (const [serviceType, route] of Object.entries(services)) {
            yaml += `        ${serviceType}:\n`
            if (route.candidates && route.candidates.length > 0) {
              const strategy = route.strategy || 'round_robin'
              yaml += `          strategy: ${strategy}\n`
              yaml += `          candidates:\n`
              for (const candidate of route.candidates) {
                yaml += `            - providerName: ${candidate.provider_name}\n`
                yaml += `              providerKeyName: ${candidate.provider_key_name}\n`
                const weight = candidate.weight ?? 1
                yaml += `              weight: ${weight}\n`
                if (candidate.enabled !== undefined) {
                  yaml += `              enabled: ${candidate.enabled ? 'true' : 'false'}\n`
                }
                if (candidate.tags && candidate.tags.length > 0) {
                  yaml += `              tags:\n`
                  for (const tag of candidate.tags) {
                    yaml += `                - ${tag}\n`
                  }
                }
              }
            } else {
              if (route.provider_name) {
                yaml += `          providerName: ${route.provider_name}\n`
              }
              if (route.provider_key_name) {
                yaml += `          providerKeyName: ${route.provider_key_name}\n`
              }
            }
          }
        }
      }
    }

    return yaml
  }
}

// Export singleton instance
export const apiClient = new ApiClient()
