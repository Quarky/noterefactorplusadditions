import {
	App,
	HeadingCache,
	Notice,
	TFile,
	TFolder,
} from "obsidian";
import { ExtractProfile } from "../types";
import { sanitizeFilename } from "./filename";
import { resolveConflict } from "./conflict";
import { appendToEnd } from "./append";
import { applyTemplate, TemplateContext } from "./template";
import { buildSourceReplacement } from "./extractor-helpers";
import { applyContentTransforms } from "./content-transforms";
import { runTemplaterOnFile } from "../compat/templater";
import {
	ensureDestinationFolder,
	resolveDestinationFolder,
} from "./destination";
import { t } from "../i18n";

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

interface HeadingRange {
	startLine: number;
	endLine: number;
	heading: HeadingCache;
}

interface FileSplitResult {
	created: number;
	matched: boolean;
}

export async function splitFolderByHeadingLevel(
	app: App,
	profile: ExtractProfile,
	folder: TFolder,
	level: HeadingLevel,
): Promise<void> {
	// Snapshot direct Markdown children before creating any destination folders.
	// This prevents newly generated source-named subfolders from being processed
	// during the same batch operation.
	const files = folder.children.filter(
		(child): child is TFile =>
			child instanceof TFile && child.extension.toLowerCase() === "md",
	);

	let filesMatched = 0;
	let notesCreated = 0;
	let failures = 0;

	for (const file of files) {
		try {
			const result = await splitFileByHeadingLevel(app, profile, file, level);
			if (result.matched) filesMatched++;
			notesCreated += result.created;
		} catch (error) {
			failures++;
			console.error(
				`Note Refactor Plus: failed to split ${file.path}`,
				error,
			);
		}
	}

	if (filesMatched === 0) {
		new Notice(t("notice.folder-split-no-matches", { level: String(level) }));
		return;
	}

	new Notice(
		t("notice.folder-split-count", {
			files: String(filesMatched),
			notes: String(notesCreated),
			failures: String(failures),
		}),
	);
}

async function splitFileByHeadingLevel(
	app: App,
	profile: ExtractProfile,
	sourceFile: TFile,
	level: HeadingLevel,
): Promise<FileSplitResult> {
	const allHeadings =
		app.metadataCache.getFileCache(sourceFile)?.headings ?? [];
	const targets = allHeadings.filter((h) => h.level === level);
	if (targets.length === 0) return { created: 0, matched: false };

	const sourceContent = await app.vault.read(sourceFile);
	const lines = sourceContent.split("\n");
	const ranges = targets
		.map((heading) =>
			getRangeForHeading(allHeadings, heading, lines.length),
		)
		.reverse();

	const destinationFolder = resolveDestinationFolder(profile, sourceFile);
	await ensureDestinationFolder(app, destinationFolder);

	let created = 0;

	for (const range of ranges) {
		let effectiveEndLine = range.endLine;
		while (
			effectiveEndLine > range.startLine &&
			(lines[effectiveEndLine] ?? "").trim() === ""
		) {
			effectiveEndLine--;
		}

		const rawContent = lines
			.slice(range.startLine, effectiveEndLine + 1)
			.join("\n");
		const basename = sanitizeFilename(range.heading.heading);

		// Folder batches must not stop for one conflict modal per heading.
		// Match the existing bulk-note split behavior by forcing increment.
		const resolution = await resolveConflict(
			app,
			destinationFolder,
			basename,
			profile.conflictPolicy,
			true,
		);
		if (resolution.action === "cancel") continue;

		const effectivePath =
			resolution.action === "create"
				? resolution.path
				: resolution.file.path;
		const sourceLink = app.fileManager.generateMarkdownLink(
			sourceFile,
			effectivePath,
		);
		const transformedContent = applyContentTransforms(
			rawContent,
			profile,
			"heading",
		);
		const ctx: TemplateContext = {
			content: transformedContent,
			title: basename,
			sourceLink,
			sourceTitle: sourceFile.basename,
			sourcePath: sourceFile.path,
			heading: findParentHeading(allHeadings, range.heading),
		};
		const body = await applyTemplate(app, profile.templatePath, ctx);

		let newFile: TFile;
		if (resolution.action === "create") {
			newFile = await app.vault.create(resolution.path, body);
			created++;
		} else {
			newFile = resolution.file;
			await appendToEnd(app, newFile, body);
		}
		if (profile.runTemplaterAfter) {
			await runTemplaterOnFile(app, newFile);
		}

		const link = app.fileManager.generateMarkdownLink(
			newFile,
			sourceFile.path,
			undefined,
			basename,
		);
		const replacement = buildSourceReplacement(
			profile,
			link,
			rawContent,
			basename,
		);
		const replacementLines = replacement ? replacement.split("\n") : [];
		lines.splice(
			range.startLine,
			effectiveEndLine - range.startLine + 1,
			...replacementLines,
		);
	}

	const updated = lines.join("\n");
	if (updated !== sourceContent) {
		await app.vault.modify(sourceFile, updated);
	}

	return { created, matched: true };
}

function getRangeForHeading(
	allHeadings: HeadingCache[],
	heading: HeadingCache,
	totalLines: number,
): HeadingRange {
	const startLine = heading.position.start.line;
	const idx = allHeadings.indexOf(heading);
	let endLine = totalLines - 1;
	for (let i = idx + 1; i < allHeadings.length; i++) {
		if (allHeadings[i].level <= heading.level) {
			endLine = allHeadings[i].position.start.line - 1;
			break;
		}
	}
	return { startLine, endLine, heading };
}

function findParentHeading(
	allHeadings: HeadingCache[],
	heading: HeadingCache,
): string {
	const idx = allHeadings.indexOf(heading);
	for (let i = idx - 1; i >= 0; i--) {
		if (allHeadings[i].level < heading.level) {
			return allHeadings[i].heading;
		}
	}
	return "";
}
