# Embedded IDE Pro

An enhanced version of the popular Embedded IDE extension for VS Code.

## 🚀 Pro Features

### 1. Advanced CMake Project Support
Full workflow support for importing and developing CMake projects directly in EIDE.

- **Intelligent Project Import**:
  - Parses `compile_commands.json` to extract compilation arguments, include paths, macros, and libraries.
  - Automatically identifies ARM/RISC-V toolchain types.
  - Supports **Ninja** generator and response file (`@file.rsp`) parsing.
- **Linker Script Auto-Discovery**:
  - Extracts `-T` flags from `link.txt`.
  - Scans project root for `.ld/.lds` files, prioritizing scripts matching "FLASH" (optimized for STM32).
- **Project Auto-Refresh**:
  - **Real-time Monitoring**: Automatically watches `CMakeLists.txt` for changes.
  - **Synchronization**: Syncs include paths, defines, source files, and toolchain paths.

### 2. Critical Bug Fixes & Improvements (Keil Support)
Resolved critical issues that prevented successful compilation of imported Keil projects (fixing `L6406E` and `ENOENT` errors).

- **Fixed Linker Error (L6406E: No space in execution regions)**:
  - **Scatter File Sync**: Forces conversion of `scatterFilePath` to a project-relative path (rejecting absolute paths) to ensure portability.
  - **XML Parsing Robustness**: Fixed a bug in `src/KeilXmlParser.ts` where `x2js` returned objects instead of strings for XML attributes, causing memory addresses to parse as `0`. Added `getNodeText` helper for safe value extraction.
  - **Validation**: Added memory layout validation in `src/EIDEProjectExplorer.ts`. Updates with invalid layouts (all size 0) are ignored with a warning to prevent overwriting valid configurations.
- **Fixed `spawnSync ENOENT` Error**:
  - Added strict `fs.existsSync` checks in `src/ToolchainManager.ts` to prevent crashes when querying invalid toolchain paths.
- **New Feature**: Added "Refresh Keil Project" context menu command for manual synchronization.

### 3. Unified Context Menu
- **Seamless Experience**: Context menu options for CMake projects now match the rich feature set of standard EIDE projects.
- **Enhanced Capabilities**:
  - Generate Debugger Config
  - Show Compiler CommandLine
  - Show All Project Variables
  - Export As...
  - Static Check

---

## 📑 Summary

A powerful MCU development environment for `8051/STM8/Cortex-M/MIPS/RISC-V` on VS Code.

**Supported Platforms:**
- **Windows x64 (>= Windows 10)**
- **Linux x64**
- **macOS** (Tested on macOS 10.15 x64)

## 🎉 Core Features

* **Wide MCU Support**: 8051, STM8, Cortex-M, MIPS MTI, RISC-V.
* **Project Imports**: Import KEIL5/IAR/Eclipse projects directly.
* **Toolchain Support**: armcc, gcc-arm-none-eabi, llvm-for-arm, riscv-gcc, keil_c51, sdcc, and more.
* **Flasher Support**: J-Link, ST-Link, OpenOCD, PyOCD.
* **IntelliSense**: Built-in `C/C++ IntelliSense Provider` - no complex `c_cpp_properties.json` configuration needed.
* **Utility Tools**: CMSIS Config Wizard, Disassembly View, Program Resource View.

## 🏃‍♀️ Quick Start

1. **Install Compiler**: Install your preferred compiler (GCC, ARMCC, etc.).
2. **Setup**: Open the **Operations** bar to set the compiler path.
3. **Start**: Click `New` or `Import` to begin your embedded journey.

## 🌈 Community & Support

This is a fork maintained for enhanced features.
- [Original Repository](https://github.com/github0null/eide)
- [Original Homepage](https://em-ide.com)