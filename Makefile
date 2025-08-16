
# Makefile - 适配 monorepo 风格的目录结构

# --------- 变量定义 -----------
GITHOOKS_DIR := .githooks
PRE_COMMIT_HOOK := $(GITHOOKS_DIR)/pre-commit

FRONTEND_DIR := frontend
BACKEND_DIR := backend
OUTPUT_DIR := build/bin # 建议将构建输出统一到 build/bin

.PHONY: help install hooks clean-hooks show-hooks lint format format-check lint-all \
		 lint-staged lint-staged-debug \
         frontend-dev frontend-build frontend-preview \
         dev build preview

# --------- 帮助信息 -----------
help:  ## 📜 显示所有可用命令（分类展示）
	@echo "  使用 \033[36mmake <command>\033[0m 执行以下命令：\n"
	@echo " 🔧 Git Hooks 管理"
	@grep -E '^(hooks|clean-hooks|show-hooks):.*?## ' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo " 📦 项目安装与初始化"
	@grep -E '^(install|install-frontend|install-wails):.*?## ' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo " ✨ 代码检查、测试与格式化"
	@grep -E '^(lint|format|format-check|lint-all|lint-staged|test|test-ui|lint-staged-debug):.*?## ' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo " 🌐 前端独立命令"
	@grep -E '^(frontend-dev|frontend-build|frontend-preview):.*?## ' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo " 🚀 Wails 集成命令"
	@grep -E '^(dev|build|preview):.*?## ' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

help-all:  ## 📜 显示所有可用命令
	@echo "  使用 \033[36mmake <command>\033[0m 执行以下命令："
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# --------- Git Hooks 相关 -----------
hooks:  ## 🔧 初始化 Git hooks
	@echo "🔧 设置 Git hooks 路径为 $(GITHOOKS_DIR) ..."
	@git config core.hooksPath $(GITHOOKS_DIR)
	@mkdir -p $(GITHOOKS_DIR)
	@echo '#!/bin/sh' > $(PRE_COMMIT_HOOK)
	@echo 'set -e' >> $(PRE_COMMIT_HOOK)
	@echo '' >> $(PRE_COMMIT_HOOK)
	@echo 'echo "🔍 [pre-commit] 自动格式化并检查暂存的前端代码..."' >> $(PRE_COMMIT_HOOK)
	@echo '# 使用 --filter 精确指定在 frontend 目录运行 lint-staged' >> $(PRE_COMMIT_HOOK)
	@echo 'pnpm --filter $(FRONTEND_DIR) exec lint-staged' >> $(PRE_COMMIT_HOOK)
	@echo '' >> $(PRE_COMMIT_HOOK)
	@echo 'echo "✅ 代码检查通过，准备提交..."' >> $(PRE_COMMIT_HOOK)
	@chmod +x $(PRE_COMMIT_HOOK)
	@echo "✅ Git hooks 初始化完成。"
	@$(MAKE) show-hooks

clean-hooks:  ## 🧹 清理 Git hooks 配置和脚本
	@echo "🔁 重置 core.hooksPath 为默认值"
	@git config --unset core.hooksPath || true
	@echo "🧹 清理 .githooks/ ..."
	@rm -rf $(GITHOOKS_DIR)

show-hooks:  ## 🔍 显示当前 Git hooks 配置路径
	@echo "➡️ 当前 Git hooks 路径为：$$(git config core.hooksPath)"

# --------- 项目安装与初始化 -----------
install: install-frontend install-wails hooks ## 📦 安装所有依赖并初始化环境
	@echo "🎉 项目环境初始化完成！可以使用 make dev 启动开发环境"

install-frontend:  ## 📦 仅安装前端依赖
	@echo "📦 安装前端依赖..."
	@pnpm --filter $(FRONTEND_DIR) install
	@echo "✅ 前端依赖安装完成"

install-wails:  ## 🛠 安装 Wails 工具链
	@echo "🔧 检查并安装 Wails 工具链..."
	@go install github.com/wailsapp/wails/v2/cmd/wails@latest
	@echo "✅ Wails 工具链已安装/更新"

# --------- 前端代码检查与格式化 (使用 --filter) -----------
lint:  ## 🔎 运行 ESLint 检查
	@echo "🔍 运行 ESLint 检查..."
	@pnpm --filter $(FRONTEND_DIR) run lint

lint-all:  ## 🔎 完整检查（类型+格式+lint）
	@echo "🔍 运行 完整检查（类型+格式+lint）..."
	@pnpm --filter $(FRONTEND_DIR) run lint-all

lint-staged:  ## 🔎 git 暂存检查（类型+格式+lint）
	@echo "🔍 运行 git 暂存检查（类型+格式+lint）..."
	@pnpm --filter $(FRONTEND_DIR) run lint-staged

lint-staged-debug:  ## 🔎 git 暂存检查(debug 模式)（类型+格式+lint）
	@echo "🔍 运行 git 暂存检查(debug 模式)（类型+格式+lint）..."
	@pnpm --filter $(FRONTEND_DIR) run lint-staged:debug

test:  ## 🧪 运行所有前端测试
	@echo "🧪 运行所有测试..."
	@pnpm --filter $(FRONTEND_DIR) run test

test-ui:  ## 🧪 在 UI 模式下运行前端测试
	@echo "🧪 在 UI 模式下运行测试..."
	@pnpm --filter $(FRONTEND_DIR) run test:ui

format:  ## ✨ 自动格式化所有前端代码
	@echo "✨ 自动格式化代码..."
	@pnpm --filter $(FRONTEND_DIR) run format

format-check:  ## ✨ 检查未格式化的文件
	@echo "✨ 检查未格式化的文件..."
	@pnpm --filter $(FRONTEND_DIR) run format-check


# --------- 前端原生开发命令 (使用 --filter) -----------
frontend-dev:  ## 🌐 启动前端原生开发环境
	@echo "🌐 启动前端开发服务器..."
	@pnpm --filter $(FRONTEND_DIR) run dev

frontend-build:  ## 🌐 构建前端生产资源
	@echo "📦 构建前端生产版本..."
	@pnpm --filter $(FRONTEND_DIR) run build

frontend-preview:  ## 🌐 预览前端生产版本
	@echo "🔍 预览前端生产版本..."
	@pnpm --filter $(FRONTEND_DIR) run preview

# --------- Wails 集成开发命令 -----------
dev: ## 🚀 启动 Wails 开发环境（前后端联动）
	@echo "🚀 启动 Wails 开发模式..."
	@wails dev -tags debug -loglevel Debug

build: ## 📦 构建 Wails 生产版本
	@echo "📦 构建 Wails 应用..."
	@wails build -o $(OUTPUT_DIR)/app

preview: ## 🔍 预览 Wails 生产版本
	@echo "🔍 预览 Wails 应用..."
	@./$(OUTPUT_DIR)/app
