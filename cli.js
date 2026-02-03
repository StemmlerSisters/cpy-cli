#!/usr/bin/env node
import path from 'node:path';
import fs from 'node:fs';
import process from 'node:process';
import os from 'node:os';
import meow from 'meow';
import cpy from 'cpy';
import {isDynamicPattern} from 'globby';

function isDirectory(filePath) {
	try {
		return fs.statSync(filePath).isDirectory();
	} catch {
		return false;
	}
}

const cli = meow(`
	Usage
	  $ cpy <source …> <destination>

	Options
	  --no-overwrite       Don't overwrite the destination
	  --cwd=<dir>          Working directory for files
	  --base=<mode>        Base mode for destination paths: cwd or pattern
	  --rename=<filename>  Rename all <source> filenames to <filename>. Supports string templates.
	  --dot                Allow patterns to match entries that begin with a period (.)
	  --flat               Flatten directory structure. All copied files will be put in the same directory.
	  --dry-run            List files that would be copied without actually copying
	  --concurrency        Number of files being copied concurrently

	<source> can contain globs if quoted

	Errors if no files match, similar to cp.

	If the source is a single file and the destination is not an existing directory, it will be treated as a file-to-file copy (like cp).

	Examples
	  Copy all .png files in src folder into dist except src/goat.png
	  $ cpy 'src/*.png' '!src/goat.png' dist

	  Copy all files inside src folder into dist and preserve path structure
	  $ cpy . '../dist/' --cwd=src

	  Copy a single file to a specific filename
	  $ cpy .env.development .env

	  Copy all .png files in the src folder to dist and prefix the image filenames
	  $ cpy 'src/*.png' dist --cwd=src --rename=hi-{{basename}}
`, {
	importMeta: import.meta,
	flags: {
		overwrite: {
			type: 'boolean',
			default: true,
		},
		cwd: {
			type: 'string',
			default: process.cwd(),
		},
		base: {
			type: 'string',
		},
		rename: {
			type: 'string',
		},
		dot: {
			type: 'boolean',
			default: false,
		},
		flat: {
			type: 'boolean',
			default: false,
		},
		dryRun: {
			type: 'boolean',
			default: false,
		},
		concurrency: {
			type: 'number',
			default: (os.cpus().length > 0 ? os.cpus().length : 1) * 2,
		},
	},
});

try {
	const {rename} = cli.flags;
	const stringTemplate = '{{basename}}';
	if (rename?.includes(stringTemplate)) {
		cli.flags.rename = (source, destination) => {
			destination.name = rename.replaceAll(stringTemplate, source.nameWithoutExtension) + (source.extension ? `.${source.extension}` : '');
		};
	}

	const copyFiles = [];

	let destination = cli.input.pop();
	const sourcePatterns = cli.input.filter(pattern => !pattern.startsWith('!'));
	const hasDestination = typeof destination === 'string';
	const hasTrailingSeparator = hasDestination && /[\\/]$/.test(destination);
	const sourcePatternForDynamicCheck = sourcePatterns.length === 1 && process.platform === 'win32' ? sourcePatterns[0].replaceAll('\\', '/') : sourcePatterns[0];
	const isFileToFileCopy = sourcePatterns.length === 1
		&& hasDestination
		&& !isDynamicPattern(sourcePatternForDynamicCheck)
		&& !isDirectory(path.resolve(cli.flags.cwd, sourcePatterns[0]))
		&& !hasTrailingSeparator
		&& !isDirectory(path.resolve(cli.flags.cwd, destination));

	if (isFileToFileCopy) {
		const destinationFilename = path.basename(destination);
		cli.flags.rename = (source, destination) => {
			destination.name = destinationFilename;
		};

		cli.flags.flat = true;
		destination = path.dirname(destination);
	}

	const files = await cpy(cli.input, destination, {
		cwd: cli.flags.cwd,
		base: cli.flags.base,
		rename: cli.flags.rename,
		overwrite: cli.flags.overwrite,
		dot: cli.flags.dot,
		flat: cli.flags.flat,
		concurrency: cli.flags.concurrency,
		dryRun: cli.flags.dryRun,
		onProgress({sourcePath, destinationPath}) {
			if (cli.flags.dryRun) {
				copyFiles.push({sourcePath, destinationPath});
			}
		},
	});

	if (files.length === 0) {
		console.error('No files matched the given patterns');
		process.exit(1);
	}

	if (cli.flags.dryRun) {
		for (const {sourcePath, destinationPath} of copyFiles) {
			console.log(`${path.relative(process.cwd(), sourcePath)} → ${path.relative(process.cwd(), destinationPath)}`);
		}
	}
} catch (error) {
	if (error.name === 'CpyError') {
		console.error(error.message);
		process.exit(1);
	} else {
		throw error;
	}
}
