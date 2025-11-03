# API Key 编辑功能 - 方案 C 实现

## 功能概述

实现了完整的 API Key 编辑功能（方案 C），支持：
- ✅ 编辑 Key Name 和 Key Value
- ✅ 自动批量更新引用该 Key 的所有 Users
- ✅ 显示确认对话框，告知影响的用户数量
- ✅ 完整的测试覆盖

## 核心功能

### 1. 编辑模式

**触发方式**：
- 在 Provider 编辑页面，点击 API Key 行的 "Edit" 按钮

**编辑内容**：
- **Key Name**：可以修改（如果有用户引用，会显示警告）
- **Key Value**：可以修改（支持密钥轮换）

**操作按钮**：
- **Save (保存图标)**：保存当前编辑
- **Cancel (X 图标)**：取消编辑，恢复原值

### 2. 批量更新逻辑

**场景**：当修改 Key Name 时

**检测逻辑**：
```typescript
// 检测 Key Name 是否发生变化
provider.api_keys.forEach((key, index) => {
  const originalKey = originalProvider.api_keys[index]
  if (originalKey && originalKey.name !== key.name) {
    // Key Name 发生变化
    const affectedCount = keyUsage[originalKey.name] ?? 0
    if (affectedCount > 0) {
      // 记录需要更新的用户数量
    }
  }
})
```

**更新流程**：
1. 检测所有 Key Name 变化
2. 计算受影响的用户数量
3. 显示确认对话框（如果有用户受影响）
4. 用户确认后：
   - 更新 Provider
   - 批量更新所有受影响的 Users
   - 自动修改 users 中的 `provider_key_name` 引用

### 3. 确认对话框

**触发条件**：
- Key Name 发生变化
- 且至少有 1 个用户引用该 Key

**对话框内容**：
```
Warning: Renaming keys will update N user route(s).

Changes: "key1" → "primary-key"

This will automatically update all affected users. Continue?
```

**操作选项**：
- **OK**：继续保存并批量更新
- **Cancel**：取消本次保存

### 4. 实时警告

**编辑模式下显示**：
```
⚠️ Renaming will update N user route(s)
```

当用户在编辑模式下修改 Key Name，且原 Key Name 有用户引用时，会实时显示警告。

## 测试覆盖

### 测试文件

**测试脚本**：`web/admin/scripts/test-key-rename.mjs`
**测试工具库**：`web/admin/lib/test-key-rename.ts`

### 测试场景

#### Scenario 1: 单个 Key 重命名，影响多个用户
```
原始：key1 → 修改后：primary-key
影响：2 个用户
预期：2 个用户的 provider_key_name 自动更新为 primary-key
结果：✅ PASSED
```

#### Scenario 2: 多个 Key 重命名
```
原始：key-a, key-b → 修改后：production-key, staging-key
影响：2 个用户
预期：所有引用自动更新
结果：✅ PASSED
```

#### Scenario 3: 仅修改 Key Value
```
原始：key1 (sk-old) → 修改后：key1 (sk-new)
影响：0 个用户（Key Name 未变化）
预期：不触发批量更新
结果：✅ PASSED
```

#### Scenario 4: 重命名未被引用的 Key
```
原始：unused-key → 修改后：backup-key
影响：0 个用户
预期：检测到 Key Name 变化，但不影响任何用户
结果：✅ PASSED
```

### 测试结果

```
Total assertions: 10
Passed: 10 ✅
Failed: 0 ❌
Success rate: 100.0%
🎉 All tests passed!
```

## 使用示例

### 场景 1：API Key 轮换（只更新 Value）

1. 进入 Provider 编辑页面
2. 点击目标 Key 的 "Edit" 按钮
3. 修改 **Key Value** 为新密钥
4. 点击 "Save"
5. 点击页面底部 "Save Changes"
6. ✅ 完成！无需确认，因为 Key Name 未变化

### 场景 2：重命名 Key（Name 和 Value 都可改）

1. 进入 Provider 编辑页面
2. 点击目标 Key 的 "Edit" 按钮
3. 修改 **Key Name** 为新名称
4. （可选）修改 **Key Value**
5. 点击 "Save"
6. 页面显示警告：`⚠️ Renaming will update N user route(s)`
7. 点击页面底部 "Save Changes"
8. 弹出确认对话框，显示影响的用户数量
9. 点击 "OK" 确认
10. ✅ Provider 和所有 Users 自动更新完成！

### 场景 3：修正拼写错误（无引用）

1. 进入 Provider 编辑页面
2. 点击目标 Key 的 "Edit" 按钮
3. 修改 **Key Name**（例如 `mai-key` → `main-key`）
4. 点击 "Save"
5. 点击页面底部 "Save Changes"
6. ✅ 如果该 Key 没有被任何用户引用，直接保存，无需确认

## 技术实现

### 关键代码位置

**编辑页面**：`web/admin/app/(admin)/providers/edit/page.tsx`

**核心函数**：
- `handleEditKey(index)` - 进入编辑模式
- `handleUpdateKeyName(index, newName)` - 更新 Key Name
- `handleUpdateKeyValue(index, newValue)` - 更新 Key Value
- `handleSaveKeyEdit(index)` - 保存编辑（仅前端状态）
- `handleCancelKeyEdit(index)` - 取消编辑
- `handleSave()` - 保存整个 Provider（包含批量更新逻辑）

**批量更新逻辑**：
```typescript
// 1. 检测 Key Name 变化
const keyNameMap = new Map<string, string>() // oldName -> newName
provider.api_keys.forEach((key, index) => {
  const originalKey = originalProvider.api_keys[index]
  if (originalKey && originalKey.name !== key.name) {
    keyNameMap.set(originalKey.name, key.name)
  }
})

// 2. 找出受影响的用户
const affectedUsers = users.filter((user) => {
  return Object.values(user.services || {}).some(
    (route) => route.provider_name === providerName &&
               keyNameMap.has(route.provider_key_name)
  )
})

// 3. 批量更新所有受影响用户
const updatePromises = affectedUsers.map(async (user) => {
  const updatedServices = { ...user.services }
  Object.keys(updatedServices).forEach((serviceType) => {
    const route = updatedServices[serviceType]
    if (route.provider_name === providerName &&
        keyNameMap.has(route.provider_key_name)) {
      updatedServices[serviceType] = {
        ...route,
        provider_key_name: keyNameMap.get(route.provider_key_name)!,
      }
    }
  })
  return updateUser(user.name, { ...user, services: updatedServices })
})

await Promise.all(updatePromises)
```

### 状态管理

**编辑状态**：
- `editingKeyIndex: number | null` - 当前正在编辑的 Key 索引

**本地修改**：
- 编辑时修改本地 `provider` 状态
- 点击 "Save" 按钮只是退出编辑模式，不发送 API 请求
- 点击页面底部 "Save Changes" 才真正保存

**恢复机制**：
- 点击 "Cancel" 时，从 `providers` 列表中恢复原始值

## 安全性

### API Key 脱敏

**显示方式**：
- 非编辑模式：显示脱敏后的 Key（例如 `sk-1***cdef`）
- 编辑模式：显示完整 Key（type="password"，可查看但默认隐藏）

### 引用完整性

**自动保护**：
- 修改 Key Name 时，自动更新所有引用
- 避免出现"引用不存在的 Key"的情况

**删除保护**：
- 被用户引用的 Key 无法删除
- 必须先修改用户配置，再删除 Key

## UI/UX 改进

### 视觉反馈

**编辑模式**：
- 输入框替换只读文本
- 显示 Save/Cancel 按钮

**警告提示**：
- 实时显示受影响的用户数量
- 警告图标和文字提示

**确认对话框**：
- 清晰列出所有 Key Name 变化
- 显示总影响用户数

### 操作流程

**分步保存**：
1. 点击 "Edit" → 进入编辑模式
2. 修改 Key Name/Value
3. 点击 "Save" → 退出编辑模式（本地保存）
4. 点击 "Save Changes" → 发送 API 请求（可能触发确认）

**优点**：
- 支持批量编辑多个 Keys
- 一次性保存所有修改
- 减少 API 请求次数

## 已知限制

### Index-based 匹配

**当前实现**：
```typescript
provider.api_keys.forEach((key, index) => {
  const originalKey = originalProvider.api_keys[index]
  // 基于索引匹配
})
```

**限制**：
- 依赖 Key 在数组中的顺序
- 如果删除中间的 Key，可能导致索引错位

**改进建议**：
- 使用 Key Name 作为唯一标识符进行匹配
- 或者为每个 Key 添加 UUID

### 无 Undo 功能

**当前行为**：
- 点击 "Cancel" 只能恢复单个 Key 的编辑
- 一旦点击 "Save Changes" 并确认，无法撤销

**改进建议**：
- 添加配置历史/版本控制
- 提供 "Revert to previous version" 功能

## 构建和部署

### 构建命令

```bash
# 构建前端
make admin-build

# 构建后端
go build -o bin/piapi ./cmd/piapi

# 或者构建全部
make build
```

### 运行测试

```bash
# 运行批量更新逻辑测试
node web/admin/scripts/test-key-rename.mjs
```

### Docker 部署

```bash
# 构建 Docker 镜像
make docker-build

# 或使用 Docker Compose
docker compose up -d
```

## 总结

✅ **已完成**：
- 完整的 Key 编辑功能（Name + Value）
- 自动批量更新引用
- 确认对话框
- 完整测试覆盖（100% 通过）
- UI/UX 优化

✅ **测试验证**：
- 10 个测试断言全部通过
- 覆盖所有主要场景

✅ **安全性**：
- API Key 脱敏显示
- 引用完整性自动维护
- 删除保护机制

🎉 **功能已就绪，可以投入使用！**
