# Makefile - 统一项目管理（含 Git Hooks、前端 Lint/Format、Wails）

GITHOOKS_DIR := .githooks
PRE_COMMIT_HOOK := $(GITHOOKS_DIR)/pre-commit

# 前端目录和文件匹配规则（根据实际项目结构调整）
FRONTEND_DIR := frontend
SRC_FILES := 'src/**/*.{ts,tsx,js,jsx,vue}'  # 匹配 src 目录下的所有代码文件

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
	@echo 'echo "🔍 [pre-commit] 运行前端代码检查和格式化..."' >> $(PRE_COMMIT_HOOK)
	@echo 'cd frontend || exit 1' >> $(PRE_COMMIT_HOOK)
	@echo '' >> $(PRE_COMMIT_HOOK)
	@echo '# 先检查 ESLint 错误（覆盖所有前端目录）' >> $(PRE_COMMIT_HOOK)
	@echo 'pnpm exec eslint src --ext .ts,.tsx,.js,.jsx' >> $(PRE_COMMIT_HOOK)  # 检查常见扩展名
	@echo '' >> $(PRE_COMMIT_HOOK)
	@echo '# 再检查 Prettier 格式' >> $(PRE_COMMIT_HOOK)
	@echo "pnpm exec prettier --check 'src/**/*.{ts,tsx,js,jsx,vue}'" >> $(PRE_COMMIT_HOOK)
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

lint:  ## 🔎 运行 ESLint 检查（仅检查错误，不自动修复）
	@echo "🔍 运行 ESLint 检查前端代码..."
	@cd $(FRONTEND_DIR) && pnpm exec eslint src --ext .ts,.tsx,.js,.jsx

format-check:  ## 📋 检查未格式化的文件（Prettier）
	@echo "🔍 检查未格式化的文件（Prettier）..."
	@cd $(FRONTEND_DIR) && pnpm exec prettier --check $(SRC_FILES)

format:  ## ✨ 自动格式化所有前端代码（ESLint+Prettier）
	@echo "✨ 自动修复 ESLint 可修复错误..."
	@cd $(FRONTEND_DIR) && pnpm exec eslint src --ext .ts,.tsx,.js,.jsx --fix
	@echo "✨ 自动格式化代码（Prettier）..."
	@cd $(FRONTEND_DIR) && pnpm exec prettier --write $(SRC_FILES)
	@echo "✅ 格式化完成！"

# --------- Wails 相关 -----------

dev:  ## 🚀 启动 Wails 开发环境
	@echo "🚀 启动 Wails 开发环境..."
	@wails dev

build:  ## 📦 构建 Wails 项目（生成可执行文件）
	@echo "📦 构建 Wails 项目..."
	@wails build