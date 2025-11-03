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
  provider_name: string
  provider_key_name: string
}

export interface User {
  name: string
  api_key: string
  services: {
    [serviceType: string]: UserServiceRoute
  }
}

export interface Config {
  providers: Provider[]
  users: User[]
}

class ApiClient {
  private baseURL: string
  private token: string | null = null

  constructor() {
    // Base URL for admin API
    this.baseURL = '/admin/api'

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
    const headers: HeadersInit = {
      ...options.headers,
    }

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`
    }

    if (options.method && options.method !== 'GET' && options.body) {
      if (typeof options.body === 'string' && !headers['Content-Type']) {
        // Default to JSON for string bodies
        headers['Content-Type'] = 'application/json'
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
        if (provider.services.length > 0) {
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
        if (Object.keys(user.services).length > 0) {
          yaml += `      services:\n`
          for (const [serviceType, route] of Object.entries(user.services)) {
            yaml += `        ${serviceType}:\n`
            yaml += `            providerName: ${route.provider_name}\n`
            yaml += `            providerKeyName: ${route.provider_key_name}\n`
          }
        }
      }
    }

    return yaml
  }
}

// Export singleton instance
export const apiClient = new ApiClient()
