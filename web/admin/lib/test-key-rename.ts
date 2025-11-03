/**
 * Test utilities for API key rename functionality
 *
 * This file contains test scenarios to verify the batch update logic
 * when renaming API keys in a provider.
 */

export interface TestProvider {
  name: string
  api_keys: Array<{ name: string; value: string }>
  services: Array<{ type: string; base_url: string }>
}

export interface TestUser {
  name: string
  api_key: string
  services: {
    [serviceType: string]: {
      provider_name: string
      provider_key_name: string
    }
  }
}

/**
 * Simulates the key rename logic
 */
export function simulateKeyRename(
  originalProvider: TestProvider,
  updatedProvider: TestProvider,
  users: TestUser[]
): {
  affectedUsers: TestUser[]
  updatedUsers: TestUser[]
  keyNameChanges: Array<{ oldName: string; newName: string }>
} {
  const keyNameMap = new Map<string, string>()

  // Detect key name changes
  updatedProvider.api_keys.forEach((key, index) => {
    const originalKey = originalProvider.api_keys[index]
    if (originalKey && originalKey.name !== key.name) {
      keyNameMap.set(originalKey.name, key.name)
    }
  })

  const keyNameChanges = Array.from(keyNameMap.entries()).map(([oldName, newName]) => ({
    oldName,
    newName,
  }))

  if (keyNameMap.size === 0) {
    return { affectedUsers: [], updatedUsers: [], keyNameChanges: [] }
  }

  // Find affected users
  const affectedUsers = users.filter((user) => {
    return Object.values(user.services || {}).some(
      (route) =>
        route.provider_name === originalProvider.name &&
        keyNameMap.has(route.provider_key_name)
    )
  })

  // Update affected users
  const updatedUsers = affectedUsers.map((user) => {
    const updatedServices = { ...user.services }
    Object.keys(updatedServices).forEach((serviceType) => {
      const route = updatedServices[serviceType]
      if (
        route.provider_name === originalProvider.name &&
        keyNameMap.has(route.provider_key_name)
      ) {
        updatedServices[serviceType] = {
          ...route,
          provider_key_name: keyNameMap.get(route.provider_key_name)!,
        }
      }
    })

    return {
      ...user,
      services: updatedServices,
    }
  })

  return { affectedUsers, updatedUsers, keyNameChanges }
}

/**
 * Test scenarios
 */
export const testScenarios = {
  /**
   * Scenario 1: Rename a single key with multiple users
   */
  scenario1: () => {
    const originalProvider: TestProvider = {
      name: "openai",
      api_keys: [
        { name: "key1", value: "sk-old-value-1" },
        { name: "key2", value: "sk-old-value-2" },
      ],
      services: [{ type: "codex", base_url: "https://api.openai.com" }],
    }

    const updatedProvider: TestProvider = {
      name: "openai",
      api_keys: [
        { name: "primary-key", value: "sk-old-value-1" }, // Renamed from key1
        { name: "key2", value: "sk-old-value-2" },
      ],
      services: [{ type: "codex", base_url: "https://api.openai.com" }],
    }

    const users: TestUser[] = [
      {
        name: "user1",
        api_key: "user1-api-key",
        services: {
          codex: { provider_name: "openai", provider_key_name: "key1" },
        },
      },
      {
        name: "user2",
        api_key: "user2-api-key",
        services: {
          codex: { provider_name: "openai", provider_key_name: "key1" },
        },
      },
      {
        name: "user3",
        api_key: "user3-api-key",
        services: {
          codex: { provider_name: "openai", provider_key_name: "key2" },
        },
      },
    ]

    const result = simulateKeyRename(originalProvider, updatedProvider, users)

    return {
      description: "Rename key1 to primary-key, affecting 2 users",
      expectedAffectedCount: 2,
      expectedKeyChanges: [{ oldName: "key1", newName: "primary-key" }],
      result,
      assertions: [
        {
          name: "Should affect exactly 2 users",
          pass: result.affectedUsers.length === 2,
          actual: result.affectedUsers.length,
          expected: 2,
        },
        {
          name: "Should detect 1 key name change",
          pass: result.keyNameChanges.length === 1,
          actual: result.keyNameChanges.length,
          expected: 1,
        },
        {
          name: "user1 should reference primary-key",
          pass: result.updatedUsers[0]?.services.codex?.provider_key_name === "primary-key",
          actual: result.updatedUsers[0]?.services.codex?.provider_key_name,
          expected: "primary-key",
        },
        {
          name: "user2 should reference primary-key",
          pass: result.updatedUsers[1]?.services.codex?.provider_key_name === "primary-key",
          actual: result.updatedUsers[1]?.services.codex?.provider_key_name,
          expected: "primary-key",
        },
      ],
    }
  },

  /**
   * Scenario 2: Rename multiple keys
   */
  scenario2: () => {
    const originalProvider: TestProvider = {
      name: "anthropic",
      api_keys: [
        { name: "key-a", value: "sk-ant-value-a" },
        { name: "key-b", value: "sk-ant-value-b" },
      ],
      services: [{ type: "claude_code", base_url: "https://api.anthropic.com" }],
    }

    const updatedProvider: TestProvider = {
      name: "anthropic",
      api_keys: [
        { name: "production-key", value: "sk-ant-value-a" }, // Renamed
        { name: "staging-key", value: "sk-ant-value-b" },    // Renamed
      ],
      services: [{ type: "claude_code", base_url: "https://api.anthropic.com" }],
    }

    const users: TestUser[] = [
      {
        name: "prod-user",
        api_key: "prod-api-key",
        services: {
          claude_code: { provider_name: "anthropic", provider_key_name: "key-a" },
        },
      },
      {
        name: "staging-user",
        api_key: "staging-api-key",
        services: {
          claude_code: { provider_name: "anthropic", provider_key_name: "key-b" },
        },
      },
    ]

    const result = simulateKeyRename(originalProvider, updatedProvider, users)

    return {
      description: "Rename both keys, affecting all users",
      expectedAffectedCount: 2,
      expectedKeyChanges: [
        { oldName: "key-a", newName: "production-key" },
        { oldName: "key-b", newName: "staging-key" },
      ],
      result,
      assertions: [
        {
          name: "Should affect exactly 2 users",
          pass: result.affectedUsers.length === 2,
          actual: result.affectedUsers.length,
          expected: 2,
        },
        {
          name: "Should detect 2 key name changes",
          pass: result.keyNameChanges.length === 2,
          actual: result.keyNameChanges.length,
          expected: 2,
        },
        {
          name: "prod-user should reference production-key",
          pass: result.updatedUsers[0]?.services.claude_code?.provider_key_name === "production-key",
          actual: result.updatedUsers[0]?.services.claude_code?.provider_key_name,
          expected: "production-key",
        },
        {
          name: "staging-user should reference staging-key",
          pass: result.updatedUsers[1]?.services.claude_code?.provider_key_name === "staging-key",
          actual: result.updatedUsers[1]?.services.claude_code?.provider_key_name,
          expected: "staging-key",
        },
      ],
    }
  },

  /**
   * Scenario 3: No key name changes
   */
  scenario3: () => {
    const originalProvider: TestProvider = {
      name: "openai",
      api_keys: [{ name: "key1", value: "sk-old" }],
      services: [{ type: "codex", base_url: "https://api.openai.com" }],
    }

    const updatedProvider: TestProvider = {
      name: "openai",
      api_keys: [{ name: "key1", value: "sk-new-rotated" }], // Only value changed
      services: [{ type: "codex", base_url: "https://api.openai.com" }],
    }

    const users: TestUser[] = [
      {
        name: "user1",
        api_key: "user1-api-key",
        services: {
          codex: { provider_name: "openai", provider_key_name: "key1" },
        },
      },
    ]

    const result = simulateKeyRename(originalProvider, updatedProvider, users)

    return {
      description: "Only key value changed, no users affected",
      expectedAffectedCount: 0,
      expectedKeyChanges: [],
      result,
      assertions: [
        {
          name: "Should not affect any users",
          pass: result.affectedUsers.length === 0,
          actual: result.affectedUsers.length,
          expected: 0,
        },
        {
          name: "Should detect no key name changes",
          pass: result.keyNameChanges.length === 0,
          actual: result.keyNameChanges.length,
          expected: 0,
        },
      ],
    }
  },

  /**
   * Scenario 4: Rename key with no references
   */
  scenario4: () => {
    const originalProvider: TestProvider = {
      name: "custom",
      api_keys: [
        { name: "unused-key", value: "sk-unused" },
        { name: "used-key", value: "sk-used" },
      ],
      services: [{ type: "codex", base_url: "https://custom.api.com" }],
    }

    const updatedProvider: TestProvider = {
      name: "custom",
      api_keys: [
        { name: "backup-key", value: "sk-unused" }, // Renamed
        { name: "used-key", value: "sk-used" },
      ],
      services: [{ type: "codex", base_url: "https://custom.api.com" }],
    }

    const users: TestUser[] = [
      {
        name: "user1",
        api_key: "user1-api-key",
        services: {
          codex: { provider_name: "custom", provider_key_name: "used-key" },
        },
      },
    ]

    const result = simulateKeyRename(originalProvider, updatedProvider, users)

    return {
      description: "Rename unused key, no users affected",
      expectedAffectedCount: 0,
      expectedKeyChanges: [{ oldName: "unused-key", newName: "backup-key" }],
      result,
      assertions: [
        {
          name: "Should not affect any users",
          pass: result.affectedUsers.length === 0,
          actual: result.affectedUsers.length,
          expected: 0,
        },
        {
          name: "Should still detect 1 key name change",
          pass: result.keyNameChanges.length === 1,
          actual: result.keyNameChanges.length,
          expected: 1,
        },
      ],
    }
  },
}

/**
 * Run all test scenarios
 */
export function runAllTests() {
  const scenarios = [
    testScenarios.scenario1(),
    testScenarios.scenario2(),
    testScenarios.scenario3(),
    testScenarios.scenario4(),
  ]

  console.log("=== API Key Rename Logic Tests ===\n")

  scenarios.forEach((scenario, index) => {
    console.log(`Test ${index + 1}: ${scenario.description}`)
    console.log(`Expected affected users: ${scenario.expectedAffectedCount}`)
    console.log(`Expected key changes: ${JSON.stringify(scenario.expectedKeyChanges)}\n`)

    let allPassed = true
    scenario.assertions.forEach((assertion) => {
      const status = assertion.pass ? "✅ PASS" : "❌ FAIL"
      console.log(`  ${status}: ${assertion.name}`)
      if (!assertion.pass) {
        console.log(`    Expected: ${JSON.stringify(assertion.expected)}`)
        console.log(`    Actual: ${JSON.stringify(assertion.actual)}`)
        allPassed = false
      }
    })

    console.log(`\nResult: Affected ${scenario.result.affectedUsers.length} user(s)`)
    console.log(`Key changes: ${JSON.stringify(scenario.result.keyNameChanges)}`)
    console.log(`Overall: ${allPassed ? "✅ ALL PASSED" : "❌ SOME FAILED"}\n`)
    console.log("---\n")
  })

  const totalTests = scenarios.reduce((sum, s) => sum + s.assertions.length, 0)
  const passedTests = scenarios.reduce(
    (sum, s) => sum + s.assertions.filter((a) => a.pass).length,
    0
  )

  console.log(`\n=== Summary ===`)
  console.log(`Total assertions: ${totalTests}`)
  console.log(`Passed: ${passedTests}`)
  console.log(`Failed: ${totalTests - passedTests}`)
  console.log(
    `Success rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`
  )

  return passedTests === totalTests
}
