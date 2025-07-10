# Makefile - 统一项目管理（含 Git Hooks、前端 Lint/Format、Wails）

GITHOOKS_DIR := .githooks
PRE_COMMIT_HOOK := $(GITHOOKS_DIR)/pre-commit

# 前端目录
FRONTEND_DIR := frontend

.PHONY: help hooks clean-hooks show-hooks lint format format-check dev build

help:  ## 📜 显示所有可用命令
	@echo "🛠️ 项目管理命令列表："
	@echo "===================="
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'
	@echo "===================="

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
	@echo 'pnpm run lint-all' >> $(PRE_COMMIT_HOOK)  # 调用完整检查（类型+格式）
	@echo '' >> $(PRE_COMMIT_HOOK)
	@echo 'echo "✅ 代码检查通过，准备提交..."' >> $(PRE_COMMIT_HOOK)

clean-hooks:  ## 🧹 清理 Git hooks 配置和脚本
	@echo "🧹 清理 .githooks/ ..."
	@rm -rf $(GITHOOKS_DIR)
	@echo "🔁 重置 core.hooksPath 为默认值"
	@git config --unset core.hooksPath || true

show-hooks:  ## 🔍 显示当前 Git hooks 配置路径
	@echo "➡️ 当前 Git hooks 路径为：$$(git config core.hooksPath)"

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

# --------- Wails 相关 -----------

dev:  ## 🚀 启动开发环境
	@echo "🚀 启动开发环境..."
	@cd $(FRONTEND_DIR) && pnpm run dev

build:  ## 📦 构建生产版本
	@echo "📦 构建生产版本..."
	@cd $(FRONTEND_DIR) && pnpm run build

preview:  ## 🔍 预览生产版本
	@echo "🔍 预览生产版本..."
	@cd $(FRONTEND_DIR) && pnpm run preview