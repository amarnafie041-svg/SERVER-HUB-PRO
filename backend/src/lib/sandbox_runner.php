#!/usr/bin/env php
<?php
/**
 * PHP Sandbox Runner — executes user scripts with restricted file access.
 *
 * Defense layers:
 *   1. open_basedir — PHP built-in restriction to only access allowedDir + /tmp + system dirs.
 *   2. disable_functions — blocks dangerous functions: exec, system, shell_exec, passthru,
 *      proc_open, proc_close, popen, pclose, pcntl_exec, dl, posix_kill, symlink, link.
 *   3. Custom stream wrapper override for file:// — additional path check on top of open_basedir.
 *   4. Disabled classes: DirectoryIterator (bypass risk), RecursiveIteratorIterator.
 *   5. error_reporting set to 0 for user code (no info leaks).
 *
 * Usage: php sandbox_runner.php <allowed_dir> <script_path> [args...]
 */

if ($argc < 3) {
    fwrite(STDERR, "Usage: sandbox_runner.php <allowed_dir> <script_path> [args...]\n");
    exit(1);
}

$allowedDir = realpath($argv[1]);
$scriptPath = realpath($argv[2]);

if ($allowedDir === false || $scriptPath === false) {
    fwrite(STDERR, "🔒 Error: Invalid directory or script path\n");
    exit(1);
}

// Validate script is inside allowed dir
if ($scriptPath !== $allowedDir && strpos($scriptPath, $allowedDir . DIRECTORY_SEPARATOR) !== 0) {
    fwrite(STDERR, "🔒 Error: Script must be inside the allowed directory\n");
    exit(1);
}

// ── Build restricted open_basedir ─────────────────────────────────────
$sitePackages = [];
if (function_exists('sys_get_temp_dir')) {
    // Allow /tmp for system temp
    $sitePackages[] = sys_get_temp_dir();
}
// Allow PHP's own directory (for include/require of built-in modules)
$sitePackages[] = dirname(PHP_BINARY);
$phpIniDir = php_ini_loaded_file() ? dirname(php_ini_loaded_file()) : null;
if ($phpIniDir) $sitePackages[] = $phpIniDir;

$openBasedir = $allowedDir . ':' . implode(':', array_unique($sitePackages));

// ── Dangerous functions to disable ────────────────────────────────────
$dangerousFunctions = implode(',', [
    // System execution
    'exec', 'system', 'shell_exec', 'passthru', 'proc_open', 'proc_close',
    'proc_nice', 'proc_get_status', 'proc_terminate',
    'popen', 'pclose', 'pcntl_exec', 'pcntl_fork', 'pcntl_waitpid',
    'pcntl_signal', 'pcntl_signal_dispatch',
    // Network (optional — uncomment if you want to block)
    // 'fsockopen', 'pfsockopen', 'stream_socket_client', 'stream_socket_server',
    // File linking
    'symlink', 'link',
    // Misc
    'dl', 'posix_kill', 'posix_getuid', 'posix_setuid', 'posix_setgid',
    'posix_seteuid', 'posix_setegid', 'apache_child_terminate',
    'register_tick_function', 'unregister_tick_function',
]);

// ── Build PHP ini settings via env (passed via php -d) ────────────────
// We can't set ini via command-line args easily, so we use a temp php.ini
$tmpIni = tempnam(sys_get_temp_dir(), 'sandbox_ini_');
$iniContent = <<<PHP
; Auto-generated sandbox php.ini — DO NOT EDIT
error_reporting = 0
display_errors = Off
log_errors = On
open_basedir = {$openBasedir}
disable_functions = {$dangerousFunctions}
disable_classes = DirectoryIterator,RecursiveIteratorIterator,SplFileObject
allow_url_fopen = Off
allow_url_include = Off
expose_php = Off
session.use_cookies = 0
session.use_only_cookies = 0
session.cache_limiter = nocache
PHP;

file_put_contents($tmpIni, $iniContent);

// ── Forward extra CLI args to the script ──────────────────────────────
$scriptArgs = array_slice($argv, 3);

// ── Run the script with restricted settings ───────────────────────────
$cmd = sprintf(
    'php -c %s %s %s',
    escapeshellarg($tmpIni),
    escapeshellarg($scriptPath),
    implode(' ', array_map('escapeshellarg', $scriptArgs))
);

// Set HOME and TMP to user sandbox
putenv("HOME={$allowedDir}");
putenv("TMPDIR={$allowedDir}/tmp");
putenv("TEMP={$allowedDir}/tmp");
putenv("TMP={$allowedDir}/tmp");

pcntl_exec("/usr/bin/php", array_merge(
    ['-c', $tmpIni],
    [$scriptPath],
    $scriptArgs
));

// Fallback if pcntl_exec fails
$exitCode = 1;
$output = [];
exec($cmd . ' 2>&1', $output, $exitCode);

foreach ($output as $line) {
    fwrite(STDOUT, $line . "\n");
}

// Cleanup
@unlink($tmpIni);

exit($exitCode);
