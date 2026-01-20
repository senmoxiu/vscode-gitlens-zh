/**
 * GitLens 汉化注入脚本
 *
 * 功能：在构建时自动将 l10n/zh-cn.json 中的翻译注入到 package.json
 * 优势：源码保持英文，同步上游无冲突，汉化完全自动化
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.join(path.dirname(__filename), '..');

interface LocalizationMap {
	version: string;
	locale: string;
	contributions: {
		commands?: Record<string, { title?: string; category?: string }>;
		views?: Record<string, { name?: string; contextualTitle?: string }>;
		configuration?: Record<string, { description?: string; markdownDescription?: string }>;
	};
	webviews?: {
		patterns?: Array<{ match: string; replace: string }>;
		exact?: Record<string, string>;
	};
}

interface PackageJson {
	contributes: {
		commands: Array<{ command: string; title: string; category?: string }>;
		views: Record<string, Array<{ id: string; name: string; contextualTitle?: string }>>;
		configuration?: {
			properties?: Record<string, { description?: string; markdownDescription?: string }>;
		};
	};
}

/**
 * 主函数：注入汉化到 package.json
 */
function injectLocalization(): void {
	console.log('🌏 开始注入汉化到 package.json...');

	const l10nPath = path.join(__dirname, 'l10n', 'zh-cn.json');
	const packagePath = path.join(__dirname, 'package.json');

	// 检查汉化文件是否存在
	if (!existsSync(l10nPath)) {
		console.log('⚠️  未找到汉化文件 l10n/zh-cn.json，跳过汉化注入');
		return;
	}

	// 读取文件
	const l10nMap: LocalizationMap = JSON.parse(readFileSync(l10nPath, 'utf8'));
	const packageJson: PackageJson = JSON.parse(readFileSync(packagePath, 'utf8'));

	let changeCount = 0;

	// 1. 汉化命令
	if (l10nMap.contributions.commands) {
		for (const cmd of packageJson.contributes.commands) {
			const translation = l10nMap.contributions.commands[cmd.command];
			if (translation) {
				if (translation.title) {
					cmd.title = translation.title;
					changeCount++;
				}
				if (translation.category) {
					cmd.category = translation.category;
					changeCount++;
				}
			}
		}
	}

	// 2. 汉化视图
	if (l10nMap.contributions.views) {
		for (const [container, views] of Object.entries(packageJson.contributes.views)) {
			for (const view of views) {
				const translation = l10nMap.contributions.views[view.id];
				if (translation) {
					if (translation.name) {
						view.name = translation.name;
						changeCount++;
					}
					if (translation.contextualTitle) {
						view.contextualTitle = translation.contextualTitle;
						changeCount++;
					}
				}
			}
		}
	}

	// 3. 汉化配置项
	if (l10nMap.contributions.configuration && packageJson.contributes.configuration?.properties) {
		for (const [key, config] of Object.entries(packageJson.contributes.configuration.properties)) {
			const translation = l10nMap.contributions.configuration[key];
			if (translation) {
				if (translation.description && config.description) {
					config.description = translation.description;
					changeCount++;
				}
				if (translation.markdownDescription && config.markdownDescription) {
					config.markdownDescription = translation.markdownDescription;
					changeCount++;
				}
			}
		}
	}

	// 写回 package.json
	writeFileSync(packagePath, JSON.stringify(packageJson, null, '\t') + '\n', 'utf8');

	console.log(`✅ 汉化注入完成！共替换 ${changeCount} 处文本`);
	console.log(`📦 目标文件：${packagePath}`);
}

// 执行汉化注入
injectLocalization();
