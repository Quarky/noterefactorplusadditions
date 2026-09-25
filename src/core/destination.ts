import { App, TFile, TFolder, normalizePath } from "obsidian";
import { ExtractProfile } from "../types";

export function resolveDestinationFolder(
	profile: ExtractProfile,
	sourceFile: TFile,
): string {
	switch (profile.destination.mode) {
		case "fixed":
			return normalizePath(profile.destination.path);
		case "same-as-source": {
			const parent = sourceFile.parent?.path ?? "";
			return parent === "/" ? "" : parent;
		}
		case "source-subfolder": {
			const parent = sourceFile.parent?.path ?? "";
			const base = parent === "/" ? "" : parent;
			return normalizePath(base ? `${base}/${sourceFile.basename}` : sourceFile.basename);
		}
	}
}

export async function ensureDestinationFolder(
	app: App,
	folder: string,
): Promise<void> {
	if (!folder) return;
	const existing = app.vault.getAbstractFileByPath(folder);
	if (existing instanceof TFolder) return;
	if (existing) throw new Error(`"${folder}" is a file, not a folder.`);
	await app.vault.createFolder(folder);
}
