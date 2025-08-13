package utils

import (
	"log"
)

// Recover 捕获 panic 并记录错误日志
func Recover(logger *log.Logger) {
	if r := recover(); r != nil {
		logger.Printf("Recovered from panic: %v", r)
	}
}
