package config

import (
	"context"
	"fmt"
	"path/filepath"
	"time"

	"github.com/fsnotify/fsnotify"

	"piapi/internal/metrics"
)

// WatchFile watches the provided config file for changes and triggers reloads on the manager.
// It returns immediately after spawning an internal goroutine that terminates when ctx is done.
func WatchFile(ctx context.Context, manager *Manager, path string, logf func(string, ...interface{})) error {
	if manager == nil {
		return fmt.Errorf("manager is required")
	}

	absPath, err := filepath.Abs(path)
	if err != nil {
		return fmt.Errorf("watch config: resolve path: %w", err)
	}

	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return fmt.Errorf("watch config: %w", err)
	}

	dir := filepath.Dir(absPath)
	if err := watcher.Add(dir); err != nil {
		watcher.Close()
		return fmt.Errorf("watch config: add dir: %w", err)
	}

	fileName := filepath.Base(absPath)

	go func() {
		defer watcher.Close()

		ticker := time.NewTimer(0)
		if !ticker.Stop() {
			<-ticker.C
		}

		scheduleReload := func() {
			if !ticker.Stop() {
				select {
				case <-ticker.C:
				default:
				}
			}
			ticker.Reset(100 * time.Millisecond)
		}

		for {
			select {
			case <-ctx.Done():
				return
			case event, ok := <-watcher.Events:
				if !ok {
					return
				}
				if filepath.Base(event.Name) != fileName {
					continue
				}
				if event.Op&(fsnotify.Write|fsnotify.Create|fsnotify.Rename|fsnotify.Chmod) != 0 {
					scheduleReload()
				}
			case err, ok := <-watcher.Errors:
				if !ok {
					return
				}
				if logf != nil {
					logf("config watcher error: %v", err)
				}
			case <-ticker.C:
				if err := manager.LoadFromFile(absPath); err != nil {
					metrics.ObserveConfigReload(false)
					if logf != nil {
						logf("config reload failed: %v", err)
					}
				} else {
					metrics.ObserveConfigReload(true)
					if logf != nil {
						logf("config reloaded from %s", absPath)
					}
				}
			}
		}
	}()

	return nil
}
