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
	 * 替换字符串 - 改进版,添加安全机制
	 */
	replaceStrings(source, filename) {
		if (!this.l10nMap) {
			return source;
		}

		let result = source;
		let replacements = 0;
		let rollbacks = 0;

		// 1. 精确匹配替换 - 只匹配引号中的字符串字面量
		if (this.l10nMap.webviews?.exact) {
			for (const [en, zh] of Object.entries(this.l10nMap.webviews.exact)) {
				// 跳过注释和元数据
				if (en.startsWith('_')) continue;

				const escapedEn = this.escapeRegExp(en);
				const beforeReplace = result;
				let replaced = false;

				// 分别匹配三种引号类型,避免反向引用问题
				['"', "'", '`'].forEach(quoteChar => {
					const quote = this.escapeRegExp(quoteChar);
					const regex = new RegExp(`${quote}${escapedEn}${quote}`, 'g');
					const newResult = result.replace(regex, match => {
						return `${quoteChar}${zh}${quoteChar}`;
					});
					if (newResult !== result) {
						result = newResult;
						replaced = true;
					}
				});

				// 安全性验证: 检测是否产生了中文标识符
				if (replaced && this.hasChineseIdentifier(result) && !this.hasChineseIdentifier(beforeReplace)) {
					console.warn(`⚠️  回滚 "${en}" → "${zh}" 的替换,检测到代码标识符被破坏`);
					result = beforeReplace; // 自动回滚
					rollbacks++;
				} else if (replaced) {
					replacements++;
				}
			}
		}

		// 2. 正则模式替换
		if (this.l10nMap.webviews?.patterns) {
			for (const pattern of this.l10nMap.webviews.patterns) {
				try {
					const regex = new RegExp(pattern.match, 'g');
					const beforeReplace = result;
					result = result.replace(regex, pattern.replace);

					// 同样检测安全性
					if (this.hasChineseIdentifier(result) && !this.hasChineseIdentifier(beforeReplace)) {
						console.warn(
							`⚠️  回滚 pattern "${pattern.match}" 的替换,检测到代码标识符被破坏`,
						);
						result = beforeReplace;
						rollbacks++;
					} else if (result !== beforeReplace) {
						replacements++;
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
					const beforeReplace = result;
					result = result.replace(regex, pattern.replace);

					if (this.hasChineseIdentifier(result) && !this.hasChineseIdentifier(beforeReplace)) {
						console.warn(
							`⚠️  回滚 statusBar pattern "${pattern.match}" 的替换,检测到代码标识符被破坏`,
						);
						result = beforeReplace;
						rollbacks++;
					} else if (result !== beforeReplace) {
						replacements++;
					}
				} catch (error) {
					console.warn(`⚠️  正则表达式错误 "${pattern.match}": ${error.message}`);
				}
			}
		}

		if (replacements > 0 || rollbacks > 0) {
			this.stats.filesProcessed++;
			this.stats.stringsReplaced += replacements;

			if (this.verbose) {
				console.log(
					`  📝 ${filename}: ${replacements} 处替换${rollbacks > 0 ? `, ${rollbacks} 处回滚` : ''}`,
				);
			}
		}

		return result;
	}

	/**
	 * 检测代码中是否出现中文标识符(破坏的标志)
	 */
	hasChineseIdentifier(code) {
		// 检测: export/import/class/function/const/let/var 后面跟中文
		if (/(?:export|import|class|function|const|let|var)\s+[\u4e00-\u9fa5]/.test(code)) {
			return true;
		}
		// 检测: 对象属性名为中文 {主页: 或 .主页
		if (/[{.][\u4e00-\u9fa5]+[:\s]/.test(code)) {
			return true;
		}
		// 检测: 函数调用/方法链中的中文标识符
		if (/[\u4e00-\u9fa5]+\s*\(/.test(code)) {
			return true;
		}
		return false;
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
			// 使用 processAssets 钩子处理资源
			compilation.hooks.processAssets.tap(
				{
					name: 'LocalizationPlugin',
					stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_INLINE,
				},
				(assets) => {
					for (const [filename, asset] of Object.entries(assets)) {
						// 只处理 .js 文件（HTML 文件是模板，不应直接替换）
						if (!/\.js$/.test(filename)) {
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
