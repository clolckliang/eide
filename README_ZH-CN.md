# Embedded IDE Pro

广受欢迎的 Embedded IDE 的增强版本。

## 🚀 Pro 版增强特性

### 1. 新功能：CMake 项目深度支持
实现了将 CMake 项目直接导入 EIDE 进行开发的完整工作流。

- **智能项目导入**:
  - 解析 `compile_commands.json` 提取编译参数、include paths、宏定义和库文件。
  - 自动识别 ARM/RISC-V 工具链类型。
  - 支持 **Ninja** 生成器和 response file (`@file.rsp`) 解析。
- **链接脚本自动发现**:
  - 从 `link.txt` 中提取 `-T` 标志。
  - 扫描项目根目录下的 `.ld/.lds` 文件，优先匹配包含 "FLASH" 的脚本（针对 STM32 优化）。
- **项目自动刷新**:
  - **实时监控**: 自动监听 `CMakeLists.txt` 文件变更。
  - **全量同步**: 同步 include paths、defines、源文件及工具链路径。

### 2. 修复与改进：Keil 项目支持
解决了导致从 Keil 导入的项目无法成功编译的几个关键问题（修复 `L6406E` 和 `ENOENT` 错误）。

- **修复链接错误 (L6406E: No space in execution regions)**:
  - **分散加载文件同步**: 在同步 Keil 配置中的 `scatterFilePath` 时，强制将其转换为工程相对路径（拒绝使用绝对路径），确保工程可移植性。
  - **XML 解析增强**: 修复了 `src/KeilXmlParser.ts` 中的 BUG。由于 `x2js` 在遇到带属性的 XML 节点时会返回对象而非字符串，导致之前的代码将内存地址解析为 0。新增了 `getNodeText` 辅助函数来安全提取数值。
  - **有效性验证**: 在 `src/EIDEProjectExplorer.ts` 中增加了内存布局校验。如果检测到无效布局（大小全为0），则忽略该次更新并提示警告，避免覆盖现有正确配置。
- **修复 `spawnSync ENOENT` 错误**:
  - 在 `src/ToolchainManager.ts` 中增加了 `fs.existsSync` 检查，防止在工具链路径无效或缺失时查询编译器信息导致插件崩溃。
- **新功能**: 新增 "Refresh Keil Project" 右键菜单命令，方便手动同步 Keil 配置。

### 3. 统一的右键菜单体验
- **无缝体验**：CMake 项目的右键菜单现在与标准 EIDE 项目一样丰富强大。
- **功能增强**：
  - 生成调试器配置 (Debugger Config)
  - 显示编译器命令行 (Show Compiler CommandLine)
  - 显示所有项目变量 (Show All Project Variables)
  - 导出为... (Export As...)
  - 静态检查 (Static Check)

---

## 📑 简介

一款适用于 `8051/STM8/Cortex-M/MIPS/RISC-V` 的单片机开发环境。

**支持平台：**
- **Windows x64 (>= Windows 10)**
- **Linux x64**
- **macOS** (在 macOS 10.15 x64 测试通过)

## 🎉 核心功能

* **广泛的芯片支持**：8051, STM8, Cortex-M, MIPS MTI, RISC-V。
* **项目导入**：支持直接导入 KEIL5/IAR/Eclipse 项目。
* **工具链支持**：armcc, gcc-arm-none-eabi, llvm-for-arm, riscv-gcc, keil_c51, sdcc 等主流编译器。
* **烧录器支持**：J-Link, ST-Link, OpenOCD, PyOCD。
* **智能感知**：内置 `C/C++ IntelliSense Provider`，**无需配置** `c_cpp_properties.json` 即可获得极佳的代码跳转和补全体验。
* **实用工具**：内置 CMSIS Config Wizard, 反汇编查看, 程序资源视图等。

## 🏃‍♀️ 快速开始

1. **安装编译器**：安装你需要的编译器（如 GCC, ARMCC 等）。
2. **设置路径**：打开 **Operations** 栏，设置编译器的安装路径。
3. **开始项目**：点击 `新建` 或 `导入`，开始你的嵌入式开发之旅。

## 🌈 社区支持

这是一个为了增强功能而维护的分支版本。
- [原版仓库](https://github.com/github0null/eide)
- [原版主页](https://em-ide.com)