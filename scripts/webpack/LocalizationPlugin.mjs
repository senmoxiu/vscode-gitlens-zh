/**
 * Webpack 汉化插件
 *
 * 在构建时自动替换代码中的英文字符串为中文
 * 支持：Webview HTML、TypeScript/JavaScript 代码
 */

import { readFileSync, existsSync } from 'fs';
import path from 'path';

export class LocalizationPlugin {
	constructor(options = {}) {
		this.l10nPath = options.l10nPath || path.join(process.cwd(), 'l10n', 'zh-cn.json');
		this.enabled = options.enabled !== false;
		this.verbose = options.verbose || false;
		this.l10nMap = null;
		this.stats = {
			filesProcessed: 0,
			stringsReplaced: 0,
		};
	}

	/**
	 * 加载汉化映射文件
	 */
	loadLocalizationMap() {
		if (!this.enabled) {
			return null;
		}

		if (!existsSync(this.l10nPath)) {
			console.warn(`⚠️  未找到汉化文件：${this.l10nPath}`);
			return null;
		}

		try {
			const content = readFileSync(this.l10nPath, 'utf8');
			return JSON.parse(content);
		} catch (error) {
			console.error(`❌ 加载汉化文件失败：${error.message}`);
			return null;
		}
	}

	/**
	 * 替换字符串
	 */
	replaceStrings(source, filename) {
		if (!this.l10nMap) {
			return source;
		}

		let result = source;
		let replacements = 0;

		// 1. 精确匹配替换（性能优先）
		if (this.l10nMap.webviews?.exact) {
			for (const [en, zh] of Object.entries(this.l10nMap.webviews.exact)) {
				const regex = new RegExp(this.escapeRegExp(en), 'g');
				const newResult = result.replace(regex, zh);
				if (newResult !== result) {
					replacements++;
					result = newResult;
				}
			}
		}

		// 2. 正则模式替换
		if (this.l10nMap.webviews?.patterns) {
			for (const pattern of this.l10nMap.webviews.patterns) {
				try {
					const regex = new RegExp(pattern.match, 'g');
					const newResult = result.replace(regex, pattern.replace);
					if (newResult !== result) {
						replacements++;
						result = newResult;
					}
				} catch (error) {
					console.warn(`⚠️  正则表达式错误 "${pattern.match}": ${error.message}`);
				}
			}
		}

		// 3. 状态栏文本替换
		if (this.l10nMap.statusBar?.patterns) {
			for (const pattern of this.l10nMap.statusBar.patterns) {
				try {
					const regex = new RegExp(pattern.match, 'g');
					const newResult = result.replace(regex, pattern.replace);
					if (newResult !== result) {
						replacements++;
						result = newResult;
					}
				} catch (error) {
					console.warn(`⚠️  正则表达式错误 "${pattern.match}": ${error.message}`);
				}
			}
		}

		if (replacements > 0) {
			this.stats.filesProcessed++;
			this.stats.stringsReplaced += replacements;

			if (this.verbose) {
				console.log(`  📝 ${filename}: ${replacements} 处替换`);
			}
		}

		return result;
	}

	/**
	 * 转义正则表达式特殊字符
	 */
	escapeRegExp(string) {
		return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	/**
	 * Webpack 插件入口
	 */
	apply(compiler) {
		if (!this.enabled) {
			console.log('ℹ️  汉化插件已禁用');
			return;
		}

		// 加载汉化映射
		this.l10nMap = this.loadLocalizationMap();
		if (!this.l10nMap) {
			console.log('ℹ️  跳过汉化注入（未找到映射文件）');
			return;
		}

		console.log(`🌏 汉化插件已启用，使用映射文件：${this.l10nPath}`);

		// 处理所有模块
		compiler.hooks.compilation.tap('LocalizationPlugin', (compilation) => {
			compilation.hooks.optimizeChunkAssets = undefined; // 禁用已弃用的钩子

			// 使用 processAssets 钩子处理资源
			compilation.hooks.processAssets.tap(
				{
					name: 'LocalizationPlugin',
					stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_INLINE,
				},
				(assets) => {
					for (const [filename, asset] of Object.entries(assets)) {
						// 只处理 .js 和 .html 文件
						if (!/\.(js|html)$/.test(filename)) {
							continue;
						}

						try {
							const originalSource = asset.source();
							const content =
								typeof originalSource === 'string' ? originalSource : originalSource.toString();

							const replacedContent = this.replaceStrings(content, filename);

							if (replacedContent !== content) {
								compilation.updateAsset(filename, new compiler.webpack.sources.RawSource(replacedContent));
							}
						} catch (error) {
							console.error(`❌ 处理文件失败 ${filename}:`, error.message);
						}
					}
				},
			);
		});

		// 构建完成后输出统计信息
		compiler.hooks.done.tap('LocalizationPlugin', () => {
			if (this.stats.filesProcessed > 0) {
				console.log(`\n✅ 汉化注入完成：`);
				console.log(`   📂 处理文件数：${this.stats.filesProcessed}`);
				console.log(`   🔤 替换字符串：${this.stats.stringsReplaced}`);
			}
		});
	}
}
