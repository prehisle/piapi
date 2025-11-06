# GitHub CI 优化总结

## 优化前的问题

- **docker job**: 1分28秒 ✅ 性能尚可
- **package job**: 1分43秒 ⚠️ 完全重新构建前端和后端

## 优化措施

### 1. 复用构建产物（最大优化 - 预计节省 40-60 秒）

**问题**: package job 重新安装 pnpm、Node.js 依赖，重新构建整个前端（1-2分钟）

**解决方案**:
- build job 构建一次前端，上传 artifacts
- package job 下载预构建的前端 artifacts
- 新增 `make release-skip-admin` 跳过前端构建

**改动**:
- `.github/workflows/ci.yml`:
  - build job 新增 upload-artifact 步骤
  - package job 新增 download-artifact 步骤
  - package job 移除 pnpm/Node.js 设置（节省约 10 秒）
  - package job 使用 `release-skip-admin` 而非 `release`
- `Makefile`: 新增 `release-skip-admin` 目标

**预期效果**: package job 从 **1分43秒 → 约 40-50秒**

### 2. Docker 缓存优化（预计节省 10-20 秒）

**问题**: registry cache 可能较慢，尤其在网络不佳时

**解决方案**:
- 从 `type=registry` 切换到 `type=gha` (GitHub Actions cache)
- GHA cache 通常比 registry cache 快 2-3 倍

**改动**:
```yaml
# 之前
cache-from: type=registry,ref=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:buildcache
cache-to: type=registry,ref=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:buildcache,mode=max

# 现在
cache-from: type=gha
cache-to: type=gha,mode=max
```

**预期效果**: docker job 从 **1分28秒 → 约 1分钟**

## 优化后预期性能

| Job | 优化前 | 优化后 | 改进 |
|-----|--------|--------|------|
| build | ~2分钟 | ~2分钟 | - |
| docker | 1分28秒 | ~1分钟 | ✅ 减少 30% |
| package | 1分43秒 | **~40-50秒** | ✅ 减少 60% |

**总体 CI 时间**: 从 ~3分30秒 → **~2分30秒**（节省约 30%）

## 额外优化建议（可选）

### 3. 缓存 Go 构建产物（可选 - 适用于频繁提交）

如果提交非常频繁，可以考虑在 jobs 之间共享 Go build cache：

```yaml
- name: Cache Go build
  uses: actions/cache@v4
  with:
    path: ~/.cache/go-build
    key: ${{ runner.os }}-go-build-${{ hashFiles('**/*.go') }}
    restore-keys: |
      ${{ runner.os }}-go-build-
```

**预期节省**: 5-10 秒/job

### 4. 按需构建 Docker 镜像（可选 - 减少不必要的构建）

如果只想在 tag 时构建镜像：

```yaml
docker:
  if: startsWith(github.ref, 'refs/tags/')  # 只在 tag 时构建
  needs: build
```

### 5. 并行测试（可选 - 如果测试很多）

```yaml
- name: Run tests
  run: go test -parallel 4 ./...
```

## 验证方法

1. 推送代码到 main 分支
2. 查看 Actions 标签页
3. 对比优化前后的时间：
   - 查看 package job 是否从 1分43秒降至 40-50秒
   - 查看 docker job 是否从 1分28秒降至约 1分钟

## 回滚方法

如果出现问题，可以回滚：

```bash
# 回滚 CI 配置
git revert <commit-hash>

# 或手动恢复
# .github/workflows/ci.yml: 恢复 package job 的 pnpm/node 设置
# .github/workflows/ci.yml: 改回 make release
# .github/workflows/ci.yml: 恢复 registry cache
```

## 技术细节

### artifacts 上传/下载机制

- **上传**: ~2-5 秒（压缩和上传 admin UI dist 目录）
- **下载**: ~1-2 秒（从 GitHub 内部存储下载）
- **净节省**: 1-2 分钟（跳过 pnpm install + 前端构建）

### GitHub Actions cache vs Registry cache

- **GHA cache**:
  - 存储在 GitHub 内部
  - 访问速度快（同数据中心）
  - 10GB 免费配额
  - 自动清理旧缓存

- **Registry cache**:
  - 存储在 GHCR（GitHub Container Registry）
  - 需要网络往返
  - 依赖 registry 性能

### Makefile 设计原则

- `release`: 完整构建（本地使用）
- `release-skip-admin`: CI 专用（假设前端已构建）
- 保持向后兼容：`make release` 仍然可用
