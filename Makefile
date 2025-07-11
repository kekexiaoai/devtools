# Makefile - 统一项目管理（Wails 与前端独立命令并存）

GITHOOKS_DIR := .githooks
PRE_COMMIT_HOOK := $(GITHOOKS_DIR)/pre-commit

# 项目目录
FRONTEND_DIR := frontend
OUTPUT_DIR := dist

.PHONY: help hooks clean-hooks show-hooks lint format format-check \
         frontend-dev frontend-build frontend-preview \
         dev build preview

help:  ## 📜 显示所有可用命令（分类展示）
	@echo "\n  使用 \033[36mmake <command>\033[0m 执行以下命令：\n"
	
	@echo " 🔧 Git Hooks 管理"
	@grep -E '^(hooks|clean-hooks|show-hooks):.*?## ' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

	@echo "\n 📦 项目安装与初始化"  # 新增分类
	@grep -E '^(install|install-frontend|install-wails):.*?## ' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

	@echo "\n ✨ 代码检查与格式化"
	@grep -E '^(lint|format|format-check|lint-all):.*?## ' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	
	@echo "\n 🌐 前端独立命令"
	@grep -E '^(frontend-dev|frontend-build|frontend-preview):.*?## ' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	
	@echo "\n 🚀 Wails 集成命令"
	@grep -E '^(dev|build|preview):.*?## ' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

help-all:  ## 📜 显示所有可用命令
	@echo "\n  使用 \033[36mmake <command>\033[0m 执行以下命令：\n\n"
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# --------- Git Hooks 相关 -----------

hooks: $(PRE_COMMIT_HOOK)  ## 🔧 初始化 Git hooks
	@echo "🔧 设置 Git hooks 路径为 $(GITHOOKS_DIR) ..."
	@git config core.hooksPath $(GITHOOKS_DIR)
	@chmod +x $(PRE_COMMIT_HOOK)
	@echo "✅ Git hooks 初始化完成。"
	@$(MAKE) show-hooks

$(PRE_COMMIT_HOOK):
	@echo "📎 生成 pre-commit hook 脚本 ..."
	@mkdir -p $(GITHOOKS_DIR)
	@echo '#!/bin/sh' > $(PRE_COMMIT_HOOK)
	@echo 'set -e' >> $(PRE_COMMIT_HOOK)
	@echo '' >> $(PRE_COMMIT_HOOK)
	@echo 'echo "🔍 [pre-commit] 自动格式化并检查代码..."' >> $(PRE_COMMIT_HOOK)
	@echo 'cd $(FRONTEND_DIR) || exit 1' >> $(PRE_COMMIT_HOOK)
	@echo '' >> $(PRE_COMMIT_HOOK)
	@echo '# 执行前端项目中定义的 lint 和 format 脚本' >> $(PRE_COMMIT_HOOK)
	@echo 'pnpm run lint-all' >> $(PRE_COMMIT_HOOK)
	@echo '' >> $(PRE_COMMIT_HOOK)
	@echo 'echo "✅ 代码检查通过，准备提交..."' >> $(PRE_COMMIT_HOOK)

clean-hooks:  ## 🧹 清理 Git hooks 配置和脚本
	@echo "🧹 清理 .githooks/ ..."
	@rm -rf $(GITHOOKS_DIR)
	@echo "🔁 重置 core.hooksPath 为默认值"
	@git config --unset core.hooksPath || true

show-hooks:  ## 🔍 显示当前 Git hooks 配置路径
	@echo "➡️ 当前 Git hooks 路径为：$$(git config core.hooksPath)"

# --------- 项目安装与初始化 -----------

install:  ## 📦 安装项目依赖并初始化环境
	@echo "📦 开始安装项目依赖..."
	@cd $(FRONTEND_DIR) && pnpm install
	@echo "✅ 前端依赖安装完成"
	@echo "🔧 检查并安装 Wails 工具链..."
	@command -v wails >/dev/null 2>&1 || go install github.com/wailsapp/wails/v2/cmd/wails@latest
	@echo "✅ Wails 工具链已安装/更新"
	@$(MAKE) hooks  # 自动初始化 Git hooks
	@echo "🎉 项目环境初始化完成！可以使用 make dev 启动开发环境"

install-frontend:  ## 📦 仅安装前端依赖
	@echo "📦 安装前端依赖..."
	@cd $(FRONTEND_DIR) && pnpm install
	@echo "✅ 前端依赖安装完成"

install-wails:  ## 🛠 安装 Wails 工具链
	@echo "🔧 检查并安装 Wails 工具链..."
	@command -v wails >/dev/null 2>&1 || go install github.com/wailsapp/wails/v2/cmd/wails@latest
	@echo "✅ Wails 工具链已安装/更新"


# --------- 前端代码检查与格式化 -----------

lint:  ## 🔎 运行 ESLint 检查
	@echo "🔍 运行 ESLint 检查..."
	@cd $(FRONTEND_DIR) && pnpm run lint

format-check:  ## 📋 检查未格式化的文件
	@echo "🔍 检查未格式化的文件..."
	@cd $(FRONTEND_DIR) && pnpm run format:check

format:  ## ✨ 自动格式化所有前端代码
	@echo "✨ 自动格式化代码..."
	@cd $(FRONTEND_DIR) && pnpm run format

lint-all:  ## 🔍 运行完整检查（类型+格式+lint）
	@echo "🔍 运行完整代码检查..."
	@cd $(FRONTEND_DIR) && pnpm run lint-all

# --------- 前端原生开发命令 -----------

frontend-dev:  ## 🌐 启动前端原生开发环境（独立运行）
	@echo "🌐 启动前端开发服务器..."
	@cd $(FRONTEND_DIR) && pnpm run dev

frontend-build:  ## 🌐 构建前端生产资源（独立打包）
	@echo "📦 构建前端生产版本..."
	@cd $(FRONTEND_DIR) && pnpm run build

frontend-preview:  ## 🌐 预览前端生产版本（独立预览）
	@echo "🔍 预览前端生产版本..."
	@cd $(FRONTEND_DIR) && pnpm run preview

# --------- Wails 集成开发命令 -----------

dev:  ## 🚀 启动 Wails 开发环境（前后端联动）
	@echo "🚀 启动 Wails 开发模式..."
	@wails dev  # Wails 主应用监听前端变化

build:  ## 📦 构建 Wails 生产版本（打包为可执行文件）
	@echo "📦 构建前端资源..."
	@cd $(FRONTEND_DIR) && pnpm run build
	@echo "📦 构建 Wails 应用..."
	@wails build -o $(OUTPUT_DIR)/app -ldflags="-s -w"

preview:  ## 🔍 预览 Wails 生产版本（运行打包后的应用）
	@echo "🔍 预览 Wails 应用..."
	@$(OUTPUT_DIR)/app