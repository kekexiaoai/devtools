package utils

import (
	"log"
)

// SafeGo 启动一个 goroutine 并在内部捕获 panic
func SafeGo(logger *log.Logger, fn func()) {
	go func() {
		defer func() {
			if r := recover(); r != nil {
				logger.Printf("Recovered from panic in goroutine: %v", r)
			}
		}()
		fn()
	}()
}
