/**
 * @file .vscode-test.mjs
 * @brief Test-runner discovery configuration for compiled extension tests.
 *
 * Platform : VS Code Test CLI
 * Author   : Daniel Fridman (schermaiolo)
 */
import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
	files: 'out/test/**/*.test.js',
});
