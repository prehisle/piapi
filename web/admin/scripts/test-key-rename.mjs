#!/usr/bin/env node

/**
 * Test runner for API key rename logic
 * Usage: node scripts/test-key-rename.mjs
 */

const simulateKeyRename = (originalProvider, updatedProvider, users) => {
  const keyNameMap = new Map()

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
          provider_key_name: keyNameMap.get(route.provider_key_name),
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

const runTest = (scenario) => {
  const result = simulateKeyRename(
    scenario.originalProvider,
    scenario.updatedProvider,
    scenario.users
  )

  return {
    ...scenario,
    result,
    passed: scenario.assertions.every(a => a.check(result))
  }
}

// Test scenarios
const scenarios = [
  {
    name: "Scenario 1: Rename single key with multiple users",
    description: "Rename key1 to primary-key, affecting 2 users",
    originalProvider: {
      name: "openai",
      api_keys: [
        { name: "key1", value: "sk-old-value-1" },
        { name: "key2", value: "sk-old-value-2" },
      ],
      services: [{ type: "codex", base_url: "https://api.openai.com" }],
    },
    updatedProvider: {
      name: "openai",
      api_keys: [
        { name: "primary-key", value: "sk-old-value-1" },
        { name: "key2", value: "sk-old-value-2" },
      ],
      services: [{ type: "codex", base_url: "https://api.openai.com" }],
    },
    users: [
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
    ],
    assertions: [
      {
        name: "Should affect exactly 2 users",
        check: (result) => result.affectedUsers.length === 2,
        expected: 2,
        getActual: (result) => result.affectedUsers.length,
      },
      {
        name: "Should detect 1 key name change",
        check: (result) => result.keyNameChanges.length === 1,
        expected: 1,
        getActual: (result) => result.keyNameChanges.length,
      },
      {
        name: "user1 should reference primary-key",
        check: (result) => result.updatedUsers[0]?.services.codex?.provider_key_name === "primary-key",
        expected: "primary-key",
        getActual: (result) => result.updatedUsers[0]?.services.codex?.provider_key_name,
      },
      {
        name: "user2 should reference primary-key",
        check: (result) => result.updatedUsers[1]?.services.codex?.provider_key_name === "primary-key",
        expected: "primary-key",
        getActual: (result) => result.updatedUsers[1]?.services.codex?.provider_key_name,
      },
    ],
  },
  {
    name: "Scenario 2: Rename multiple keys",
    description: "Rename both keys, affecting all users",
    originalProvider: {
      name: "anthropic",
      api_keys: [
        { name: "key-a", value: "sk-ant-value-a" },
        { name: "key-b", value: "sk-ant-value-b" },
      ],
      services: [{ type: "claude_code", base_url: "https://api.anthropic.com" }],
    },
    updatedProvider: {
      name: "anthropic",
      api_keys: [
        { name: "production-key", value: "sk-ant-value-a" },
        { name: "staging-key", value: "sk-ant-value-b" },
      ],
      services: [{ type: "claude_code", base_url: "https://api.anthropic.com" }],
    },
    users: [
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
    ],
    assertions: [
      {
        name: "Should affect exactly 2 users",
        check: (result) => result.affectedUsers.length === 2,
        expected: 2,
        getActual: (result) => result.affectedUsers.length,
      },
      {
        name: "Should detect 2 key name changes",
        check: (result) => result.keyNameChanges.length === 2,
        expected: 2,
        getActual: (result) => result.keyNameChanges.length,
      },
    ],
  },
  {
    name: "Scenario 3: Only value changed",
    description: "Only key value changed, no users affected",
    originalProvider: {
      name: "openai",
      api_keys: [{ name: "key1", value: "sk-old" }],
      services: [{ type: "codex", base_url: "https://api.openai.com" }],
    },
    updatedProvider: {
      name: "openai",
      api_keys: [{ name: "key1", value: "sk-new-rotated" }],
      services: [{ type: "codex", base_url: "https://api.openai.com" }],
    },
    users: [
      {
        name: "user1",
        api_key: "user1-api-key",
        services: {
          codex: { provider_name: "openai", provider_key_name: "key1" },
        },
      },
    ],
    assertions: [
      {
        name: "Should not affect any users",
        check: (result) => result.affectedUsers.length === 0,
        expected: 0,
        getActual: (result) => result.affectedUsers.length,
      },
      {
        name: "Should detect no key name changes",
        check: (result) => result.keyNameChanges.length === 0,
        expected: 0,
        getActual: (result) => result.keyNameChanges.length,
      },
    ],
  },
  {
    name: "Scenario 4: Rename unused key",
    description: "Rename key with no references",
    originalProvider: {
      name: "custom",
      api_keys: [
        { name: "unused-key", value: "sk-unused" },
        { name: "used-key", value: "sk-used" },
      ],
      services: [{ type: "codex", base_url: "https://custom.api.com" }],
    },
    updatedProvider: {
      name: "custom",
      api_keys: [
        { name: "backup-key", value: "sk-unused" },
        { name: "used-key", value: "sk-used" },
      ],
      services: [{ type: "codex", base_url: "https://custom.api.com" }],
    },
    users: [
      {
        name: "user1",
        api_key: "user1-api-key",
        services: {
          codex: { provider_name: "custom", provider_key_name: "used-key" },
        },
      },
    ],
    assertions: [
      {
        name: "Should not affect any users",
        check: (result) => result.affectedUsers.length === 0,
        expected: 0,
        getActual: (result) => result.affectedUsers.length,
      },
      {
        name: "Should still detect 1 key name change",
        check: (result) => result.keyNameChanges.length === 1,
        expected: 1,
        getActual: (result) => result.keyNameChanges.length,
      },
    ],
  },
]

console.log("=== API Key Rename Logic Tests ===\n")

let totalTests = 0
let passedTests = 0

scenarios.forEach((scenario, index) => {
  console.log(`\n📋 Test ${index + 1}: ${scenario.name}`)
  console.log(`   ${scenario.description}\n`)

  const testResult = runTest(scenario)
  const result = testResult.result

  let scenarioPassed = true

  scenario.assertions.forEach((assertion) => {
    totalTests++
    const passed = assertion.check(result)
    if (passed) passedTests++

    const status = passed ? "✅" : "❌"
    console.log(`  ${status} ${assertion.name}`)

    if (!passed) {
      console.log(`     Expected: ${JSON.stringify(assertion.expected)}`)
      console.log(`     Actual:   ${JSON.stringify(assertion.getActual(result))}`)
      scenarioPassed = false
    }
  })

  console.log(`\n   Result: Affected ${result.affectedUsers.length} user(s)`)
  if (result.keyNameChanges.length > 0) {
    console.log(`   Key changes:`)
    result.keyNameChanges.forEach(change => {
      console.log(`     - "${change.oldName}" → "${change.newName}"`)
    })
  } else {
    console.log(`   Key changes: None`)
  }
  console.log(`\n   ${scenarioPassed ? "✅ PASSED" : "❌ FAILED"}`)
})

console.log(`\n${"=".repeat(50)}`)
console.log(`📊 Summary`)
console.log(`${"=".repeat(50)}`)
console.log(`Total assertions: ${totalTests}`)
console.log(`Passed: ${passedTests} ✅`)
console.log(`Failed: ${totalTests - passedTests} ❌`)
console.log(`Success rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`)

if (passedTests === totalTests) {
  console.log(`\n🎉 All tests passed!`)
  process.exit(0)
} else {
  console.log(`\n❌ Some tests failed!`)
  process.exit(1)
}
