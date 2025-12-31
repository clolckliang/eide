import * as fs from 'fs';
import * as NodePath from 'path';
import { VirtualFolder } from './EIDETypeDefine';
import { VirtualSource } from './EIDEProject';
import { ArrayDelRepetition } from '../lib/node-utility/Utility';
import { File } from '../lib/node-utility/File';
import { ProjectType } from './EIDETypeDefine';
import { GlobalEvent } from './GlobalEvents';

/**
 * Represents a single compile command entry from compile_commands.json
 */
export interface CmakeCompileCommand {
    directory: string;       // Build directory where the command was executed
    command?: string;        // Full compile command as a single string
    arguments?: string[];    // Command arguments as array (alternative to command)
    file: string;            // Source file path
}

/**
 * Parsed CMAKE project information
 */
export interface CmakeProjectInfo {
    name: string;            // Project name (derived from folder name)
    rootDir: string;         // Project root directory
    sourceFiles: string[];   // List of source files (relative paths)
    includePaths: string[];  // Include directories extracted from -I flags
    defines: string[];       // Macro definitions extracted from -D flags
    libPaths: string[];      // Library search paths (-L)
    libs: string[];          // Libraries (-l)
    linkerScript?: string;   // Linker script file path (-T)
    compilerPath?: string;   // Compiler executable path (first detected)
    projectType: ProjectType;// Detected project type (ARM, RISC-V, etc.)
    virtualFolder: VirtualFolder; // Virtual folder structure for sources
}

/**
 * Parse compile_commands.json and extract project information
 * @param compileCommandsFile Path to compile_commands.json file
 * @returns Parsed CmakeProjectInfo
 */
export async function parseCmakeProject(compileCommandsFile: File): Promise<CmakeProjectInfo> {

    if (!compileCommandsFile.IsFile()) {
        throw new Error(`compile_commands.json file not found: ${compileCommandsFile.path}`);
    }

    const content = fs.readFileSync(compileCommandsFile.path, 'utf-8');
    const commands: CmakeCompileCommand[] = JSON.parse(content);

    if (!Array.isArray(commands) || commands.length === 0) {
        throw new Error('compile_commands.json is empty or invalid');
    }

    // Determine project root (parent of the build directory or compile_commands.json location)
    const compileCommandsDir = compileCommandsFile.dir;
    // Try to find project root by looking at the first source file's directory
    // or use the parent of compile_commands.json directory
    let projectRoot = NodePath.dirname(compileCommandsDir);

    // Check if there's a CMakeLists.txt in the parent directory
    const parentCMakeLists = File.fromArray([projectRoot, 'CMakeLists.txt']);
    if (!parentCMakeLists.IsFile()) {
        // Use compile_commands.json directory as root
        projectRoot = compileCommandsDir;
    }

    const projectName = NodePath.basename(projectRoot);
    const projectRootFile = new File(projectRoot);

    const allIncludes: string[] = [];
    const allDefines: string[] = [];
    const allSourceFiles: string[] = [];
    const allLibPaths: string[] = [];
    const allLibs: string[] = [];
    let detectedCompiler: string | undefined;
    let detectedProjectType: ProjectType = 'ARM'; // Default to ARM

    GlobalEvent.emit('globalLog.append', `[CMakeParser] Found ${commands.length} compile commands`);

    for (const cmd of commands) {
        // Get the command arguments
        const args = getCommandArguments(cmd);
        if (args.length === 0) continue;

        // Extract compiler path (first argument)
        if (!detectedCompiler && args.length > 0) {
            detectedCompiler = args[0];
            detectedProjectType = detectProjectTypeFromCompiler(detectedCompiler);
            GlobalEvent.emit('globalLog.append', `[CMakeParser] Detected Compiler: ${detectedCompiler}, Type: ${detectedProjectType}`);
        }

        // Extract include paths
        const includes = extractIncludes(args, cmd.directory, projectRoot);
        if (includes.length > 0) {
            allIncludes.push(...includes);
            GlobalEvent.emit('globalLog.append', `[CMakeParser] Extracted ${includes.length} includes from ${cmd.file}`);
        }

        // Extract defines
        const defines = extractDefines(args);
        if (defines.length > 0) {
            allDefines.push(...defines);
        }

        // Extract libs
        const { libPaths, libs } = extractLibs(args, cmd.directory, projectRoot);
        if (libPaths.length > 0) {
            allLibPaths.push(...libPaths);
        }
        if (libs.length > 0) {
            allLibs.push(...libs);
        }

        // Add source file
        let sourceFile = cmd.file;
        // Convert to relative path if possible
        if (NodePath.isAbsolute(sourceFile)) {
            const relPath = projectRootFile.ToRelativePath(sourceFile);
            if (relPath) {
                sourceFile = relPath;
            }
        }
        if (isSourceFile(sourceFile)) {
            allSourceFiles.push(sourceFile);
        }
    }

    // Deduplicate
    const uniqueIncludes = ArrayDelRepetition(allIncludes);
    const uniqueDefines = ArrayDelRepetition(allDefines);
    const uniqueSourceFiles = ArrayDelRepetition(allSourceFiles);
    const uniqueLibPaths = ArrayDelRepetition(allLibPaths);
    const uniqueLibs = ArrayDelRepetition(allLibs);

    GlobalEvent.emit('globalLog.append', `[CMakeParser] Summary: Includes: ${uniqueIncludes.length}, Defines: ${uniqueDefines.length}, LibPaths: ${uniqueLibPaths.length}, Libs: ${uniqueLibs.length}, Sources: ${uniqueSourceFiles.length}`);

    // Build virtual folder structure from source files
    const virtualFolder = buildVirtualFolder(uniqueSourceFiles);

    // Extract linker script from link.txt files
    const linkerScript = extractLinkerScript(compileCommandsDir, projectRoot);
    if (linkerScript) {
        GlobalEvent.emit('globalLog.append', `[CMakeParser] Extracted linker script: ${linkerScript}`);
    }

    return {
        name: projectName,
        rootDir: projectRoot,
        sourceFiles: uniqueSourceFiles,
        includePaths: uniqueIncludes,
        defines: uniqueDefines,
        libPaths: uniqueLibPaths,
        libs: uniqueLibs,
        linkerScript: linkerScript,
        compilerPath: detectedCompiler,
        projectType: detectedProjectType,
        virtualFolder: virtualFolder
    };
}

/**
 * Get command arguments from compile command entry
 */
function getCommandArguments(cmd: CmakeCompileCommand): string[] {
    let args: string[] = [];

    if (cmd.arguments && Array.isArray(cmd.arguments)) {
        args = cmd.arguments;
    } else if (cmd.command) {
        // Parse command string into arguments
        args = parseCommandString(cmd.command);
    }

    // Expand response files (args starting with @)
    const expandedArgs: string[] = [];
    for (const arg of args) {
        if (arg.startsWith('@')) {
            const rspPath = arg.substring(1);
            GlobalEvent.emit('globalLog.append', `[CMakeParser] Parsing response file: ${rspPath}`);
            const rspArgs = parseResponseFile(rspPath, cmd.directory);
            if (rspArgs) {
                expandedArgs.push(...rspArgs);
            } else {
                GlobalEvent.emit('globalLog.append', `[CMakeParser] Failed to read response file: ${rspPath}`);
            }
        } else {
            expandedArgs.push(arg);
        }
    }

    return expandedArgs;
}

/**
 * Parse response file content into arguments
 */
function parseResponseFile(rspPath: string, buildDir: string): string[] | undefined {
    try {
        let fullPath = rspPath;
        if (!NodePath.isAbsolute(fullPath)) {
            fullPath = NodePath.resolve(buildDir, fullPath);
        }
        if (fs.existsSync(fullPath)) {
            const content = fs.readFileSync(fullPath, 'utf-8');
            // Response files usually contain arguments separated by spaces or newlines
            // We can reuse parseCommandString as it handles quotes and spaces
            // But we might need to handle newlines specifically if parseCommandString doesn't
            const normalized = content.replace(/[\r\n]+/g, ' ');
            return parseCommandString(normalized);
        }
    } catch (error) {
        // ignore
    }
    return undefined;
}

/**
 * Parse a command string into arguments, handling quoted strings
 */
/**
 * Parse a command string into arguments, handling quoted strings and escapes
 * Ref: KeilXmlParser.ts parseMacroString
 */
function parseCommandString(command: string): string[] {
    const args: string[] = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';
    let escaped = false;

    for (let i = 0; i < command.length; i++) {
        const char = command[i];

        if (escaped) {
            current += char;
            escaped = false;
            continue;
        }

        if (char === '\\') {
            const nextChar = command[i + 1];
            // If inside quotes, only escape the quote char or backslash
            if (inQuote) {
                if (nextChar === quoteChar || nextChar === '\\') {
                    escaped = true;
                    // Do not add the backslash itself if it's escaping a quote?
                    // Depends on shell rules. Usually backslash is preserved if it doesn't escape special char.
                    // But for simple parsing, let's just treat next char literallly.
                    // KeilParser ignores the backslash check for '\"'
                    continue;
                } else {
                    current += char; // Keep backslash
                    continue;
                }
            } else {
                // Outside quotes, backslash escapes usually mean taking next char literal
                escaped = true;
                continue;
            }
        }

        if (!inQuote && (char === '"' || char === "'")) {
            inQuote = true;
            quoteChar = char;
        } else if (inQuote && char === quoteChar) {
            inQuote = false;
            quoteChar = '';
        } else if (!inQuote && (char === ' ' || char === '\t' || char === '\r' || char === '\n')) {
            if (current.length > 0) {
                // Handle special case matching KeilParser loop: 
                // filter out empty strings if multiple spaces
                args.push(current);
                current = '';
            }
        } else {
            current += char;
        }
    }

    if (current.length > 0) {
        args.push(current);
    }

    return args;
}

/**
 * Extract include paths from compiler arguments
 */
function extractIncludes(args: string[], buildDir: string, projectRoot: string): string[] {
    const includes: string[] = [];
    const projectRootFile = new File(projectRoot);

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        let includePath: string | undefined;

        // Handle -I<path> or -I <path>
        if (arg.startsWith('-I')) {
            if (arg.length > 2) {
                includePath = arg.substring(2);
            } else if (i + 1 < args.length) {
                includePath = args[++i];
            }
        }
        // Handle -isystem <path>
        else if (arg === '-isystem' && i + 1 < args.length) {
            includePath = args[++i];
        }
        // Handle --include-directory=<path>
        else if (arg.startsWith('--include-directory=')) {
            includePath = arg.substring('--include-directory='.length);
        }

        if (includePath) {
            // Convert relative paths to be relative to project root
            if (!NodePath.isAbsolute(includePath)) {
                includePath = NodePath.resolve(buildDir, includePath);
            }
            // Try to make it relative to project root
            const relPath = projectRootFile.ToRelativePath(includePath);
            if (relPath) {
                includes.push(relPath);
            } else {
                includes.push(File.ToUnixPath(includePath));
            }
        }
    }

    return includes;
}

/**
 * Extract macro definitions from compiler arguments
 */
function extractDefines(args: string[]): string[] {
    const defines: string[] = [];

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        let define: string | undefined;

        // Handle -D<macro> or -D <macro>
        if (arg.startsWith('-D')) {
            if (arg.length > 2) {
                define = arg.substring(2);
            } else if (i + 1 < args.length) {
                define = args[++i];
            }
        }
        // Handle --define=<macro>
        else if (arg.startsWith('--define=')) {
            define = arg.substring('--define='.length);
        }

        if (define) {
            defines.push(define);
        }
    }

    return defines;
}

/**
 * Detect project type based on compiler name
 */
/**
 * Extract library paths and libraries from compiler arguments
 */
function extractLibs(args: string[], buildDir: string, projectRoot: string): { libPaths: string[], libs: string[] } {
    const libPaths: string[] = [];
    const libs: string[] = [];
    const projectRootFile = new File(projectRoot);

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        // Handle -L<path>
        if (arg.startsWith('-L')) {
            let pathVal = arg.substring(2);
            if (args.length > i + 1 && pathVal.length === 0) {
                pathVal = args[++i];
            }
            if (pathVal) {
                if (!NodePath.isAbsolute(pathVal)) {
                    pathVal = NodePath.resolve(buildDir, pathVal);
                }
                const rel = projectRootFile.ToRelativePath(pathVal);
                libPaths.push(rel ? rel : File.ToUnixPath(pathVal));
            }
        }
        // Handle -l<lib>
        else if (arg.startsWith('-l')) {
            libs.push(arg.substring(2));
        }
    }
    return { libPaths, libs };
}

/**
 * Detect project type based on compiler name
 */
function detectProjectTypeFromCompiler(compilerPath: string): ProjectType {
    const compilerName = NodePath.basename(compilerPath).toLowerCase();

    // ARM GCC patterns
    if (compilerName.includes('arm-none-eabi') ||
        compilerName.includes('arm-elf') ||
        compilerName.includes('armcc') ||
        compilerName.includes('armclang')) {
        return 'ARM';
    }

    // RISC-V patterns
    if (compilerName.includes('riscv') ||
        compilerName.includes('rv32') ||
        compilerName.includes('rv64')) {
        return 'RISC-V';
    }

    // 8051/MCS51/STM8 patterns
    if (compilerName.includes('sdcc') ||
        compilerName.includes('c51') ||
        compilerName.includes('stm8')) {
        return 'C51';
    }

    // MIPS patterns
    if (compilerName.includes('mips')) {
        return 'MIPS';
    }

    // Default to ANY-GCC for unknown compilers
    return 'ANY-GCC';
}

/**
 * Check if a file is a source file
 */
function isSourceFile(filePath: string): boolean {
    const ext = NodePath.extname(filePath).toLowerCase();
    const sourceExtensions = [
        '.c', '.cc', '.cpp', '.cxx', '.c++',
        '.s', '.S', '.asm',
        '.h', '.hh', '.hpp', '.hxx' // Include headers for completeness
    ];
    // Only include actual source files, not headers
    const compilableExtensions = [
        '.c', '.cc', '.cpp', '.cxx', '.c++',
        '.s', '.S', '.asm'
    ];
    return compilableExtensions.includes(ext);
}

/**
 * Build virtual folder structure from source file paths
 */
function buildVirtualFolder(sourceFiles: string[]): VirtualFolder {
    const root: VirtualFolder = {
        name: VirtualSource.rootName,
        files: [],
        folders: []
    };

    // Group files by their directory
    const dirMap = new Map<string, string[]>();

    for (const filePath of sourceFiles) {
        const dir = NodePath.dirname(filePath);
        const normalizedDir = dir === '.' ? '' : File.ToUnixPath(dir);

        if (!dirMap.has(normalizedDir)) {
            dirMap.set(normalizedDir, []);
        }
        dirMap.get(normalizedDir)!.push(filePath);
    }

    // Create folder structure
    for (const [dir, files] of dirMap) {
        if (dir === '') {
            // Root level files
            for (const file of files) {
                root.files.push({ path: file });
            }
        } else {
            // Create nested folder structure
            const parts = dir.split('/');
            let currentFolder = root;

            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                let subFolder = currentFolder.folders.find(f => f.name === part);

                if (!subFolder) {
                    subFolder = {
                        name: part,
                        files: [],
                        folders: []
                    };
                    currentFolder.folders.push(subFolder);
                }
                currentFolder = subFolder;
            }

            // Add files to the final folder
            for (const file of files) {
                currentFolder.files.push({ path: file });
            }
        }
    }

    return root;
}

/**
 * Extract linker script path from CMake build directory.
 * Searches for link.txt files in CMakeFiles directories and extracts -T flag.
 * Falls back to searching for .ld files in project root if link.txt doesn't exist.
 * @param buildDir Path to the build directory (location of compile_commands.json)
 * @param projectRoot Project root directory
 * @returns Resolved linker script path or undefined
 */
function extractLinkerScript(buildDir: string, projectRoot: string): string | undefined {
    try {
        const projectRootFile = new File(projectRoot);

        // Method 1: Try to find linker script from link.txt (only exists after first build)
        const cmakeFilesDir = NodePath.join(buildDir, 'CMakeFiles');
        if (fs.existsSync(cmakeFilesDir)) {
            const entries = fs.readdirSync(cmakeFilesDir);
            for (const entry of entries) {
                if (entry.endsWith('.dir')) {
                    const linkTxtPath = NodePath.join(cmakeFilesDir, entry, 'link.txt');
                    if (fs.existsSync(linkTxtPath)) {
                        const content = fs.readFileSync(linkTxtPath, 'utf-8');
                        const args = parseCommandString(content);

                        // Search for -T<script> or -T <script>
                        for (let i = 0; i < args.length; i++) {
                            const arg = args[i];
                            let scriptPath: string | undefined;

                            if (arg.startsWith('-T')) {
                                if (arg.length > 2) {
                                    scriptPath = arg.substring(2);
                                } else if (i + 1 < args.length) {
                                    scriptPath = args[++i];
                                }
                            }

                            if (scriptPath) {
                                let fullPath = scriptPath;
                                if (!NodePath.isAbsolute(fullPath)) {
                                    fullPath = NodePath.resolve(buildDir, fullPath);
                                }

                                if (fs.existsSync(fullPath)) {
                                    const relPath = projectRootFile.ToRelativePath(fullPath);
                                    GlobalEvent.emit('globalLog.append', `[CMakeParser] Found linker script from link.txt: ${relPath || fullPath}`);
                                    return relPath || File.ToUnixPath(fullPath);
                                }
                            }
                        }
                    }
                }
            }
        }

        // Method 2: Search for .ld files in project root (common for STM32CubeMX projects)
        const rootEntries = fs.readdirSync(projectRoot);
        const ldFiles = rootEntries.filter(f => f.endsWith('.ld') || f.endsWith('.lds'));
        if (ldFiles.length === 1) {
            // Only auto-select if there's exactly one .ld file
            GlobalEvent.emit('globalLog.append', `[CMakeParser] Found linker script in project root: ${ldFiles[0]}`);
            return ldFiles[0];
        } else if (ldFiles.length > 1) {
            // Multiple .ld files found - try to find one with FLASH in the name (common pattern)
            const flashLd = ldFiles.find(f => f.toUpperCase().includes('FLASH'));
            if (flashLd) {
                GlobalEvent.emit('globalLog.append', `[CMakeParser] Found FLASH linker script: ${flashLd}`);
                return flashLd;
            }
            GlobalEvent.emit('globalLog.append', `[CMakeParser] Multiple .ld files found (${ldFiles.join(', ')}), cannot auto-select`);
        }

        // Method 3: Parse CMakeLists.txt for -T flag in linker options
        const cmakeListsPath = NodePath.join(projectRoot, 'CMakeLists.txt');
        if (fs.existsSync(cmakeListsPath)) {
            const cmakeContent = fs.readFileSync(cmakeListsPath, 'utf-8');
            // Look for patterns like: -T "${CMAKE_SOURCE_DIR}/xxx.ld" or -T xxx.ld
            const tFlagMatch = cmakeContent.match(/-T\s*["']?\$\{CMAKE_SOURCE_DIR\}\/([^"'\s]+)["']?/i) ||
                cmakeContent.match(/-T\s*["']?([^"'\s]+\.lds?)["']?/i);
            if (tFlagMatch && tFlagMatch[1]) {
                const ldFileName = tFlagMatch[1];
                const fullPath = NodePath.join(projectRoot, ldFileName);
                if (fs.existsSync(fullPath)) {
                    GlobalEvent.emit('globalLog.append', `[CMakeParser] Found linker script from CMakeLists.txt: ${ldFileName}`);
                    return ldFileName;
                }
            }
        }

    } catch (error) {
        GlobalEvent.emit('globalLog.append', `[CMakeParser] Error extracting linker script: ${error}`);
    }
    return undefined;
}
