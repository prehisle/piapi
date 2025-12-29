package version

import (
	"fmt"
	"runtime"
)

// 以下变量由-ldflags在构建时注入
var (
	Version = "dev"
	Commit  = "none"
	Date    = "unknown"
)

// BuildInfo 返回单行格式的构建信息（用于日志）
func BuildInfo() string {
	return fmt.Sprintf("piapi %s (commit %s, built %s, %s)",
		Version,
		shortCommit(Commit),
		Date,
		runtime.Version(),
	)
}

// Full 返回详细版本信息（用于--version输出）
func Full() string {
	return fmt.Sprintf(`piapi %s
Commit:    %s
Built:     %s
Go:        %s
Platform:  %s/%s`,
		Version,
		Commit,
		Date,
		runtime.Version(),
		runtime.GOOS,
		runtime.GOARCH,
	)
}

func shortCommit(commit string) string {
	if len(commit) > 7 {
		return commit[:7]
	}
	return commit
}
