package main

import (
	"fmt"
	"log"
	"os"
	"path/filepath"

	"devtools/backend/pkg/sshconfig"
)

func main() {
	// 获取用户家目录
	homeDir, err := os.UserHomeDir()
	if err != nil {
		log.Fatal("无法获取用户家目录:", err)
	}

	// SSH配置文件路径
	configPath := filepath.Join(homeDir, ".ssh", "config")

	// 创建配置管理器
	manager, err := sshconfig.NewManager(configPath)
	if err != nil {
		log.Fatal("创建配置管理器失败:", err)
	}

	fmt.Println("=== 当前SSH配置分析 ===")

	// 显示Include指令
	includes := manager.GetIncludes()
	if len(includes) > 0 {
		fmt.Println("Include指令:")
		for _, include := range includes {
			fmt.Printf("  Include %s\n", include)
		}
	} else {
		fmt.Println("未找到Include指令")
	}

	// 显示全局配置 (Host *)
	globalConfig, err := manager.GetGlobalConfig()
	if err == nil {
		fmt.Println("\n全局配置 (Host *):")
		for key, params := range globalConfig.Params {
			for _, param := range params {
				fmt.Printf("  %s = %s\n", key, param.Value)
			}
		}
	} else {
		fmt.Println("\n未找到全局配置 (Host *)")
	}

	// 显示所有主机配置
	hosts, err := manager.GetAllHosts()
	if err != nil {
		log.Printf("获取主机配置失败: %v", err)
	} else {
		fmt.Printf("\n找到 %d 个主机配置:\n", len(hosts))
		for _, host := range hosts {
			if host.IsGlobal {
				fmt.Printf("\nHost * (全局配置):\n")
			} else {
				fmt.Printf("\nHost %s:\n", host.Name)
			}

			if host.Description != "" {
				fmt.Printf("  描述: %s\n", host.Description)
			}

			for key, params := range host.Params {
				for _, param := range params {
					fmt.Printf("  %s = %s\n", key, param.Value)
				}
			}
		}
	}

	fmt.Println("\n=== 配置验证 ===")
	// 验证配置文件语法
	if err := manager.Validate(); err != nil {
		fmt.Printf("配置文件有语法错误: %v\n", err)
	} else {
		fmt.Println("配置文件语法正确!")
	}

	fmt.Println("\n=== 演示配置修改 ===")

	// 创建备份
	backupPath, err := manager.Backup()
	if err != nil {
		log.Printf("创建备份失败: %v", err)
	} else {
		fmt.Printf("已创建备份: %s\n", backupPath)
	}

	// 添加一个新的主机配置
	fmt.Println("\n添加新的主机配置...")
	newHost := manager.AddHost("example-server")
	fmt.Printf("已添加主机: %s\n", newHost.Name)

	// 为新主机设置参数
	params := map[string]string{
		"HostName":     "example.com",
		"User":         "ubuntu",
		"Port":         "22",
		"IdentityFile": "~/.ssh/id_rsa",
	}

	for key, value := range params {
		err := manager.SetParam("example-server", key, value)
		if err != nil {
			log.Printf("设置参数 %s 失败: %v", key, err)
		} else {
			fmt.Printf("已设置 %s = %s\n", key, value)
		}
	}

	// 修改全局配置参数
	fmt.Println("\n修改全局配置...")
	err = manager.SetGlobalParam("Compression", "yes")
	if err != nil {
		log.Printf("设置全局参数失败: %v", err)
	} else {
		fmt.Println("已设置全局参数: Compression = yes")
	}

	// 修改现有主机的参数
	fmt.Println("\n修改现有主机配置...")
	if manager.HasHost("github.com") {
		err := manager.SetParam("github.com", "Port", "22")
		if err != nil {
			log.Printf("修改github.com端口失败: %v", err)
		} else {
			fmt.Println("已修改github.com端口为22")
		}
	}

	// 再次验证配置
	fmt.Println("\n再次验证配置...")
	if err := manager.Validate(); err != nil {
		fmt.Printf("修改后的配置有语法错误: %v\n", err)
	} else {
		fmt.Println("修改后的配置语法正确!")
	}

	// 保存配置
	fmt.Println("\n保存配置...")
	err = manager.Save()
	if err != nil {
		log.Fatal("保存配置失败:", err)
	}
	fmt.Println("配置已保存!")

	// 验证修改
	fmt.Println("\n=== 验证修改 ===")
	value, err := manager.GetParam("example-server", "HostName")
	if err != nil {
		log.Printf("获取参数失败: %v", err)
	} else {
		fmt.Printf("example-server 的 HostName = %s\n", value)
	}

	// 获取全局参数
	compression, err := manager.GetGlobalParam("Compression")
	if err != nil {
		log.Printf("获取全局参数失败: %v", err)
	} else {
		fmt.Printf("全局Compression参数值: %s\n", compression)
	}

	// 显示最终配置的前几行
	fmt.Println("\n配置文件前10行:")
	lines := manager.GetRawLines()
	for i := 0; i < len(lines) && i < 10; i++ {
		fmt.Printf("%2d: %s\n", i+1, lines[i])
	}

	fmt.Println("\n=== 完成 ===")
	fmt.Printf("配置文件路径: %s\n", configPath)
}
