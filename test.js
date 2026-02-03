import path from 'node:path';
import fs from 'node:fs';
import process from 'node:process';
import test from 'ava';
import tempfile from 'tempfile';
import {execa} from 'execa';
import {pathExistsSync} from 'path-exists';

const read = (...arguments_) => fs.readFileSync(path.join(...arguments_), 'utf8');

test.beforeEach(t => {
	t.context.tmp = tempfile();
});

test('missing file operands', async t => {
	await t.throwsAsync(execa('./cli.js'), {message: /`source` and `destination` required/});
});

test('missing destination operand', async t => {
	fs.mkdirSync(t.context.tmp);
	fs.writeFileSync(path.join(t.context.tmp, 'source.txt'), 'hello');

	await t.throwsAsync(execa('./cli.js', [path.join(t.context.tmp, 'source.txt')]), {message: /`source` and `destination` required/});
});

test('source file does not exist', async t => {
	await t.throwsAsync(execa('./cli.js', [path.join(t.context.tmp, 'nonexistentfile'), t.context.tmp]), {message: /nonexistentfile/});
});

test('glob pattern matching no files should error', async t => {
	fs.mkdirSync(t.context.tmp);
	fs.mkdirSync(path.join(t.context.tmp, 'src'));

	await t.throwsAsync(
		execa('./cli.js', ['src/*.js', 'dest', '--cwd', t.context.tmp]),
		{message: /No files matched/},
	);
});

test('glob pattern in nonexistent folder should error', async t => {
	fs.mkdirSync(t.context.tmp);

	await t.throwsAsync(
		execa('./cli.js', ['nonexistent/*.js', 'dest', '--cwd', t.context.tmp]),
		{message: /No files matched/},
	);
});

test('cwd', async t => {
	fs.mkdirSync(t.context.tmp);
	fs.mkdirSync(path.join(t.context.tmp, 'cwd'));
	fs.mkdirSync(path.join(t.context.tmp, 'cwd', 'dest'));
	fs.writeFileSync(path.join(t.context.tmp, 'cwd/hello.js'), 'console.log("hello");');

	await execa('./cli.js', ['hello.js', 'dest', '--cwd', path.join(t.context.tmp, 'cwd')]);

	t.is(read(t.context.tmp, 'cwd/hello.js'), read(t.context.tmp, 'cwd/dest/hello.js'));
});

test('path structure', async t => {
	fs.mkdirSync(t.context.tmp);
	fs.mkdirSync(path.join(t.context.tmp, 'cwd'));
	fs.mkdirSync(path.join(t.context.tmp, 'out'));
	fs.writeFileSync(path.join(t.context.tmp, 'cwd/hello.js'), 'console.log("hello");');

	await execa('./cli.js', [path.join(t.context.tmp, '**'), path.join(t.context.tmp, 'out')]);

	t.is(
		read(t.context.tmp, 'cwd/hello.js'),
		read(t.context.tmp, 'out/cwd/hello.js'),
	);
});

test('glob includes extensionless files without matching directories', async t => {
	fs.mkdirSync(t.context.tmp);
	fs.mkdirSync(path.join(t.context.tmp, 'source'));
	fs.mkdirSync(path.join(t.context.tmp, 'source', 'nested'));
	fs.writeFileSync(path.join(t.context.tmp, 'source/nested/README'), 'readme');
	fs.writeFileSync(path.join(t.context.tmp, 'source/nested/file.txt'), 'file');

	await execa('./cli.js', ['**/*', 'dest', '--cwd', path.join(t.context.tmp, 'source')]);

	t.is(read(t.context.tmp, 'source/dest/nested/README'), 'readme');
	t.is(read(t.context.tmp, 'source/dest/nested/file.txt'), 'file');
});

test('base option aligns explicit paths with globs', async t => {
	fs.mkdirSync(t.context.tmp);
	fs.mkdirSync(path.join(t.context.tmp, 'src'));
	fs.writeFileSync(path.join(t.context.tmp, 'src/README.md'), 'readme');
	fs.writeFileSync(path.join(t.context.tmp, 'src/hello-world.js'), 'console.log("hello");');

	await execa('./cli.js', ['src/*.md', 'src/hello-world.js', 'dist', '--cwd', t.context.tmp, '--base', 'pattern']);

	t.is(read(t.context.tmp, 'src/README.md'), read(t.context.tmp, 'dist/README.md'));
	t.is(read(t.context.tmp, 'src/hello-world.js'), read(t.context.tmp, 'dist/hello-world.js'));
});

test('rename filenames but not filepaths', async t => {
	fs.mkdirSync(t.context.tmp);
	fs.mkdirSync(path.join(t.context.tmp, 'dest'));
	fs.writeFileSync(path.join(t.context.tmp, 'hello.js'), 'console.log("hello");');

	await execa('./cli.js', [path.join(t.context.tmp, 'hello.js'), path.join(t.context.tmp, 'dest'), '--rename=hi.js']);

	t.is(read(t.context.tmp, 'hello.js'), read(t.context.tmp, 'dest/hi.js'));

	await execa('./cli.js', [path.join(t.context.tmp, 'hello.js'), path.join(t.context.tmp, 'dest'), '--rename=hi-{{basename}}-1']);
	t.is(read(t.context.tmp, 'hello.js'), read(t.context.tmp, 'dest/hi-hello-1.js'));
});

test('rename with multiple placeholders', async t => {
	fs.mkdirSync(t.context.tmp);
	fs.mkdirSync(path.join(t.context.tmp, 'dest'));
	fs.writeFileSync(path.join(t.context.tmp, 'hello.js'), 'console.log("hello");');

	await execa('./cli.js', [path.join(t.context.tmp, 'hello.js'), path.join(t.context.tmp, 'dest'), '--rename={{basename}}-copy-{{basename}}']);

	t.is(read(t.context.tmp, 'dest/hello-copy-hello.js'), 'console.log("hello");');
});

test('overwrite files by default', async t => {
	fs.mkdirSync(t.context.tmp);
	fs.mkdirSync(path.join(t.context.tmp, 'dest'));
	fs.writeFileSync(path.join(t.context.tmp, 'hello.js'), 'console.log("hello");');
	fs.writeFileSync(path.join(t.context.tmp, 'dest/hello.js'), 'console.log("world");');

	await execa('./cli.js', [path.join(t.context.tmp, 'hello.js'), path.join(t.context.tmp, 'dest')]);

	t.is(read(t.context.tmp, 'dest/hello.js'), 'console.log("hello");');
});

test('do not overwrite when --no-overwrite is set', async t => {
	fs.mkdirSync(t.context.tmp);
	fs.mkdirSync(path.join(t.context.tmp, 'dest'));
	fs.writeFileSync(path.join(t.context.tmp, 'hello.js'), 'console.log("hello");');
	fs.writeFileSync(path.join(t.context.tmp, 'dest/hello.js'), 'console.log("world");');

	await t.throwsAsync(
		execa('./cli.js', [path.join(t.context.tmp, 'hello.js'), path.join(t.context.tmp, 'dest'), '--no-overwrite']),
		{message: /EEXIST|already exists/},
	);

	// Verify destination content was not overwritten
	t.is(read(t.context.tmp, 'dest/hello.js'), 'console.log("world");');
});

test('update only copies when source is newer or size differs at the same mtime', async t => {
	const temporaryDirectory = t.context.tmp;
	const destinationDirectory = path.join(temporaryDirectory, 'dest');
	const sourcePath = path.join(temporaryDirectory, 'source.txt');
	const destinationPath = path.join(destinationDirectory, 'source.txt');

	fs.mkdirSync(temporaryDirectory);
	fs.mkdirSync(destinationDirectory);
	fs.writeFileSync(sourcePath, 'source-old');
	fs.writeFileSync(destinationPath, 'destination-newer');

	const olderTime = new Date('2020-01-01T00:00:00Z');
	const newerTime = new Date('2020-01-02T00:00:00Z');
	fs.utimesSync(sourcePath, olderTime, olderTime);
	fs.utimesSync(destinationPath, newerTime, newerTime);

	await execa('./cli.js', [sourcePath, destinationDirectory, '--update']);

	t.is(read(destinationDirectory, 'source.txt'), 'destination-newer');

	fs.writeFileSync(sourcePath, 'source-newer');
	const newestTime = new Date('2020-01-03T00:00:00Z');
	fs.utimesSync(sourcePath, newestTime, newestTime);

	await execa('./cli.js', [sourcePath, destinationDirectory, '--update']);

	t.is(read(destinationDirectory, 'source.txt'), 'source-newer');

	fs.writeFileSync(sourcePath, 'short');
	fs.writeFileSync(destinationPath, 'this is longer');
	const sameTime = new Date('2020-01-04T00:00:00Z');
	fs.utimesSync(sourcePath, sameTime, sameTime);
	fs.utimesSync(destinationPath, sameTime, sameTime);

	await execa('./cli.js', [sourcePath, destinationDirectory, '--update']);

	t.is(read(destinationDirectory, 'source.txt'), 'short');
});

test('update handles overlapping patterns with different destinations', async t => {
	const temporaryDirectory = t.context.tmp;
	const sourceDirectory = path.join(temporaryDirectory, 'src');
	const nestedDirectory = path.join(sourceDirectory, 'nested');
	const destinationDirectory = path.join(temporaryDirectory, 'dest');
	const sourcePath = path.join(nestedDirectory, 'file.txt');

	fs.mkdirSync(temporaryDirectory);
	fs.mkdirSync(sourceDirectory);
	fs.mkdirSync(nestedDirectory);
	fs.mkdirSync(destinationDirectory);
	fs.writeFileSync(sourcePath, 'source');

	const rootDestination = path.join(destinationDirectory, 'file.txt');
	const nestedDestination = path.join(destinationDirectory, 'nested/file.txt');
	fs.mkdirSync(path.dirname(nestedDestination), {recursive: true});
	fs.writeFileSync(rootDestination, 'destination-newer');
	fs.writeFileSync(nestedDestination, 'destination-older');

	const sourceTime = new Date('2020-01-06T00:00:00Z');
	const olderTime = new Date('2020-01-05T00:00:00Z');
	const newerTime = new Date('2020-01-07T00:00:00Z');
	fs.utimesSync(sourcePath, sourceTime, sourceTime);
	fs.utimesSync(rootDestination, newerTime, newerTime);
	fs.utimesSync(nestedDestination, olderTime, olderTime);

	await execa('./cli.js', ['src/nested/file.txt', 'src/**/file.txt', 'dest', '--cwd', temporaryDirectory, '--base', 'pattern', '--update']);

	t.is(read(destinationDirectory, 'file.txt'), 'destination-newer');
	t.is(read(destinationDirectory, 'nested/file.txt'), 'source');
});

test('update selects newest when sources collide on destination', async t => {
	const temporaryDirectory = t.context.tmp;
	const sourceDirectory = path.join(temporaryDirectory, 'src');
	const olderDirectory = path.join(sourceDirectory, 'older');
	const newerDirectory = path.join(sourceDirectory, 'newer');
	const destinationDirectory = path.join(temporaryDirectory, 'dest');

	fs.mkdirSync(temporaryDirectory);
	fs.mkdirSync(olderDirectory, {recursive: true});
	fs.mkdirSync(newerDirectory, {recursive: true});
	fs.mkdirSync(destinationDirectory);

	const olderSource = path.join(olderDirectory, 'file.txt');
	const newerSource = path.join(newerDirectory, 'file.txt');
	fs.writeFileSync(olderSource, 'older');
	fs.writeFileSync(newerSource, 'newer');

	const olderTime = new Date('2020-01-10T00:00:00Z');
	const newerTime = new Date('2020-01-11T00:00:00Z');
	fs.utimesSync(olderSource, olderTime, olderTime);
	fs.utimesSync(newerSource, newerTime, newerTime);

	const {stdout} = await execa('./cli.js', ['src/older/file.txt', 'src/newer/file.txt', 'dest', '--cwd', temporaryDirectory, '--flat', '--update', '--dry-run']);

	const newerOutputPath = path.join('src', 'newer', 'file.txt');
	const olderOutputPath = path.join('src', 'older', 'file.txt');

	t.true(stdout.includes(newerOutputPath));
	t.false(stdout.includes(olderOutputPath));
});

test('update skips when size and modification time are the same', async t => {
	const temporaryDirectory = t.context.tmp;
	const destinationDirectory = path.join(temporaryDirectory, 'dest');
	const sourcePath = path.join(temporaryDirectory, 'source.txt');
	const destinationPath = path.join(destinationDirectory, 'source.txt');

	fs.mkdirSync(temporaryDirectory);
	fs.mkdirSync(destinationDirectory);
	fs.writeFileSync(sourcePath, 'same');
	fs.writeFileSync(destinationPath, 'diff');

	const sameTime = new Date('2020-01-05T00:00:00Z');
	fs.utimesSync(sourcePath, sameTime, sameTime);
	fs.utimesSync(destinationPath, sameTime, sameTime);

	await execa('./cli.js', [sourcePath, destinationDirectory, '--update']);

	t.is(read(destinationDirectory, 'source.txt'), 'diff');
});

test('update copies when destination is missing', async t => {
	const temporaryDirectory = t.context.tmp;
	const destinationDirectory = path.join(temporaryDirectory, 'dest');
	const sourcePath = path.join(temporaryDirectory, 'source.txt');

	fs.mkdirSync(temporaryDirectory);
	fs.mkdirSync(destinationDirectory);
	fs.writeFileSync(sourcePath, 'content');

	await execa('./cli.js', [sourcePath, destinationDirectory, '--update']);

	t.is(read(destinationDirectory, 'source.txt'), 'content');
});

test('update does not skip destination directory errors', async t => {
	const temporaryDirectory = t.context.tmp;
	const destinationDirectory = path.join(temporaryDirectory, 'dest');
	const sourcePath = path.join(temporaryDirectory, 'source.txt');
	const destinationPath = path.join(destinationDirectory, 'source.txt');

	fs.mkdirSync(temporaryDirectory);
	fs.mkdirSync(destinationDirectory);
	fs.writeFileSync(sourcePath, 'content');
	fs.mkdirSync(destinationPath);

	await t.throwsAsync(
		execa('./cli.js', [sourcePath, destinationDirectory, '--update']),
		{message: /EISDIR|EPERM|EACCES|is a directory|illegal operation|operation not permitted|EEXIST/},
	);
});

test('update stat errors are reported as copy errors', async t => {
	if (process.platform === 'win32') {
		t.pass();
		return;
	}

	const temporaryDirectory = t.context.tmp;
	const destinationDirectory = path.join(temporaryDirectory, 'dest');
	const sourcePath = path.join(temporaryDirectory, 'source.txt');
	const destinationPath = path.join(destinationDirectory, 'source.txt');

	fs.mkdirSync(temporaryDirectory);
	fs.mkdirSync(destinationDirectory);
	fs.writeFileSync(sourcePath, 'content');
	fs.symlinkSync('source.txt', destinationPath);

	await t.throwsAsync(
		execa('./cli.js', [sourcePath, destinationDirectory, '--update']),
		{message: /Cannot copy from/},
	);
});

test('update is ignored when --no-overwrite is set', async t => {
	const temporaryDirectory = t.context.tmp;
	const destinationDirectory = path.join(temporaryDirectory, 'dest');
	const sourcePath = path.join(temporaryDirectory, 'source.txt');

	fs.mkdirSync(temporaryDirectory);
	fs.mkdirSync(destinationDirectory);
	fs.writeFileSync(sourcePath, 'source');
	fs.writeFileSync(path.join(destinationDirectory, 'source.txt'), 'destination');

	await t.throwsAsync(
		execa('./cli.js', [sourcePath, destinationDirectory, '--update', '--no-overwrite']),
		{message: /EEXIST|already exists/},
	);
});

test('do not copy files in the negated glob patterns', async t => {
	fs.mkdirSync(t.context.tmp);
	fs.mkdirSync(path.join(t.context.tmp, 'src'));
	fs.mkdirSync(path.join(t.context.tmp, 'dest'));
	fs.writeFileSync(path.join(t.context.tmp, 'src/hello.js'), 'console.log("hello");');
	fs.writeFileSync(path.join(t.context.tmp, 'src/hello.jsx'), 'console.log("world");');
	fs.writeFileSync(path.join(t.context.tmp, 'src/hello.es2015'), 'console.log("world");');

	await execa('./cli.js', ['src/*.*', '!src/*.jsx', '!src/*.es2015', path.join(t.context.tmp, 'dest'), '--cwd', t.context.tmp]);

	t.is(read(t.context.tmp, 'dest/hello.js'), 'console.log("hello");');
	t.false(pathExistsSync(path.join(t.context.tmp, 'dest/hello.jsx')));
	t.false(pathExistsSync(path.join(t.context.tmp, 'dest/hello.es2015')));
});

test('flatten directory tree', async t => {
	fs.mkdirSync(t.context.tmp);
	fs.mkdirSync(path.join(t.context.tmp, 'source'));
	fs.mkdirSync(path.join(t.context.tmp, 'source', 'nested'));
	fs.writeFileSync(path.join(t.context.tmp, 'foo.js'), 'console.log("foo");');
	fs.writeFileSync(path.join(t.context.tmp, 'source/bar.js'), 'console.log("bar");');
	fs.writeFileSync(path.join(t.context.tmp, 'source/nested/baz.ts'), 'console.log("baz");');

	await execa('./cli.js', ['**/*.js', 'destination/subdir', '--cwd', t.context.tmp, '--flat']);

	t.is(
		read(t.context.tmp, 'foo.js'),
		read(t.context.tmp, 'destination/subdir/foo.js'),
	);
	t.is(
		read(t.context.tmp, 'source/bar.js'),
		read(t.context.tmp, 'destination/subdir/bar.js'),
	);
	t.falsy(fs.existsSync(path.join(t.context.tmp, 'destination/subdir/baz.ts')));
});

test('copy directory as source (preserves structure)', async t => {
	fs.mkdirSync(t.context.tmp);
	fs.mkdirSync(path.join(t.context.tmp, 'src'));
	fs.mkdirSync(path.join(t.context.tmp, 'src', 'nested'));
	fs.writeFileSync(path.join(t.context.tmp, 'src/file.txt'), 'content');
	fs.writeFileSync(path.join(t.context.tmp, 'src/nested/file2.txt'), 'content2');

	await execa('./cli.js', ['src', 'out', '--cwd', t.context.tmp]);

	t.is(read(t.context.tmp, 'src/file.txt'), read(t.context.tmp, 'out/src/file.txt'));
	t.is(read(t.context.tmp, 'src/nested/file2.txt'), read(t.context.tmp, 'out/src/nested/file2.txt'));
});

test('junk files ignored even with --dot', async t => {
	fs.mkdirSync(t.context.tmp);
	fs.mkdirSync(path.join(t.context.tmp, 'src'));
	fs.writeFileSync(path.join(t.context.tmp, 'src/.DS_Store'), 'junk');
	fs.writeFileSync(path.join(t.context.tmp, 'src/.ok'), 'ok');

	await execa('./cli.js', ['**/*', path.join(t.context.tmp, 'dest'), '--cwd', path.join(t.context.tmp, 'src'), '--dot']);

	t.true(pathExistsSync(path.join(t.context.tmp, 'dest/.ok')));
	t.false(pathExistsSync(path.join(t.context.tmp, 'dest/.DS_Store')));
});

test('rename template with dotfile', async t => {
	fs.mkdirSync(t.context.tmp);
	fs.mkdirSync(path.join(t.context.tmp, 'dest'));
	fs.writeFileSync(path.join(t.context.tmp, '.gitignore'), 'foo');

	await execa('./cli.js', [path.join(t.context.tmp, '.gitignore'), path.join(t.context.tmp, 'dest'), '--rename=hi-{{basename}}', '--dot']);

	t.true(pathExistsSync(path.join(t.context.tmp, 'dest/hi-.gitignore')));
});

test('dotfiles included with --dot flag', async t => {
	fs.mkdirSync(t.context.tmp);
	fs.mkdirSync(path.join(t.context.tmp, 'src'));
	fs.writeFileSync(path.join(t.context.tmp, 'src/.hidden'), 'dotfile');
	fs.writeFileSync(path.join(t.context.tmp, 'src/visible.txt'), 'visible');

	await execa('./cli.js', ['**/*', path.join(t.context.tmp, 'dest'), '--cwd', path.join(t.context.tmp, 'src'), '--dot']);

	t.true(pathExistsSync(path.join(t.context.tmp, 'dest/visible.txt')));
	t.true(pathExistsSync(path.join(t.context.tmp, 'dest/.hidden')));
});

test('multiple source files', async t => {
	fs.mkdirSync(t.context.tmp);
	fs.mkdirSync(path.join(t.context.tmp, 'dest'));
	fs.writeFileSync(path.join(t.context.tmp, 'a.txt'), 'A');
	fs.writeFileSync(path.join(t.context.tmp, 'b.txt'), 'B');

	await execa('./cli.js', [path.join(t.context.tmp, 'a.txt'), path.join(t.context.tmp, 'b.txt'), path.join(t.context.tmp, 'dest')]);

	t.is(read(t.context.tmp, 'dest/a.txt'), 'A');
	t.is(read(t.context.tmp, 'dest/b.txt'), 'B');
});

test('cwd with glob pattern and negation, destination outside cwd', async t => {
	fs.mkdirSync(t.context.tmp);
	fs.mkdirSync(path.join(t.context.tmp, 'src'));
	fs.mkdirSync(path.join(t.context.tmp, 'src', 'Button'));
	fs.mkdirSync(path.join(t.context.tmp, 'src', 'Checkbox'));

	fs.writeFileSync(path.join(t.context.tmp, 'src/Button/Button.scss'), 'button styles');
	fs.writeFileSync(path.join(t.context.tmp, 'src/Button/Button.stories.scss'), 'button story styles');
	fs.writeFileSync(path.join(t.context.tmp, 'src/Checkbox/Checkbox.scss'), 'checkbox styles');

	await execa('./cli.js', ['**/*.scss', '!**/*.stories.scss', '../lib', '--cwd', path.join(t.context.tmp, 'src')]);

	t.is(read(t.context.tmp, 'lib/Button/Button.scss'), 'button styles');
	t.is(read(t.context.tmp, 'lib/Checkbox/Checkbox.scss'), 'checkbox styles');
	t.false(pathExistsSync(path.join(t.context.tmp, 'lib/Button/Button.stories.scss')));
});

test('cwd with directory pattern and relative destination outside cwd', async t => {
	fs.mkdirSync(t.context.tmp);
	fs.mkdirSync(path.join(t.context.tmp, 'src'));
	fs.mkdirSync(path.join(t.context.tmp, 'src', 'subdirectory'));

	fs.writeFileSync(path.join(t.context.tmp, 'src/a.file'), 'content a in src');
	fs.writeFileSync(path.join(t.context.tmp, 'src/subdirectory/a.file'), 'content a');
	fs.writeFileSync(path.join(t.context.tmp, 'src/subdirectory/another.file'), 'content b');

	await execa('./cli.js', ['.', '../../dist', '--cwd', path.join(t.context.tmp, 'src/subdirectory')]);

	t.is(read(t.context.tmp, 'dist/a.file'), 'content a');
	t.is(read(t.context.tmp, 'dist/another.file'), 'content b');
});

test('dotfiles with extension pattern and --dot flag', async t => {
	fs.mkdirSync(t.context.tmp);
	fs.mkdirSync(path.join(t.context.tmp, 'dest'));
	fs.writeFileSync(path.join(t.context.tmp, '.meshrc.yml'), 'meshrc');
	fs.writeFileSync(path.join(t.context.tmp, 'config.yml'), 'config');
	fs.writeFileSync(path.join(t.context.tmp, 'test.yaml'), 'test');

	await execa('./cli.js', ['*.{yml,yaml}', path.join(t.context.tmp, 'dest'), '--cwd', t.context.tmp, '--dot']);

	t.is(read(t.context.tmp, 'dest/.meshrc.yml'), 'meshrc');
	t.is(read(t.context.tmp, 'dest/config.yml'), 'config');
	t.is(read(t.context.tmp, 'dest/test.yaml'), 'test');
});

test('dry run lists files without copying', async t => {
	fs.mkdirSync(t.context.tmp);
	fs.mkdirSync(path.join(t.context.tmp, 'src'));
	fs.writeFileSync(path.join(t.context.tmp, 'src/hello.js'), 'console.log("hello");');

	const {stdout} = await execa('./cli.js', [path.join(t.context.tmp, 'src/hello.js'), path.join(t.context.tmp, 'dest'), '--dry-run']);

	t.regex(stdout, /hello\.js/);
	t.true(stdout.includes('→'));
	t.false(pathExistsSync(path.join(t.context.tmp, 'dest/hello.js')));
});

test('dry run update with no work produces no output', async t => {
	const temporaryDirectory = t.context.tmp;
	const destinationDirectory = path.join(temporaryDirectory, 'dest');
	const sourcePath = path.join(temporaryDirectory, 'source.txt');
	const destinationPath = path.join(destinationDirectory, 'source.txt');

	fs.mkdirSync(temporaryDirectory);
	fs.mkdirSync(destinationDirectory);
	fs.writeFileSync(sourcePath, 'source-old');
	fs.writeFileSync(destinationPath, 'destination-newer');

	const olderTime = new Date('2020-01-08T00:00:00Z');
	const newerTime = new Date('2020-01-09T00:00:00Z');
	fs.utimesSync(sourcePath, olderTime, olderTime);
	fs.utimesSync(destinationPath, newerTime, newerTime);

	const {stdout} = await execa('./cli.js', [sourcePath, destinationDirectory, '--update', '--dry-run']);

	t.is(stdout, '');
});

test('single file to file copy', async t => {
	fs.mkdirSync(t.context.tmp);
	fs.writeFileSync(path.join(t.context.tmp, 'source.txt'), 'hello');

	await execa('./cli.js', [path.join(t.context.tmp, 'source.txt'), path.join(t.context.tmp, 'target.txt')]);

	t.is(read(t.context.tmp, 'target.txt'), 'hello');
});

test('single file to file copy overwrites existing file', async t => {
	fs.mkdirSync(t.context.tmp);
	fs.writeFileSync(path.join(t.context.tmp, 'source.txt'), 'new');
	fs.writeFileSync(path.join(t.context.tmp, 'target.txt'), 'old');

	await execa('./cli.js', [path.join(t.context.tmp, 'source.txt'), path.join(t.context.tmp, 'target.txt')]);

	t.is(read(t.context.tmp, 'target.txt'), 'new');
});

test('single file to file copy with Windows path separators', async t => {
	if (process.platform !== 'win32') {
		t.pass();
		return;
	}

	fs.mkdirSync(t.context.tmp);
	const sourcePath = path.join(t.context.tmp, 'source.txt');
	fs.writeFileSync(sourcePath, 'hello');

	const destinationPath = path.join(t.context.tmp, 'target.txt');
	const windowsSourcePath = path.win32.normalize(sourcePath);
	const windowsDestinationPath = path.win32.normalize(destinationPath);

	await execa('./cli.js', [windowsSourcePath, windowsDestinationPath]);

	t.is(read(t.context.tmp, 'target.txt'), 'hello');
	t.false(fs.statSync(destinationPath).isDirectory());
});

test('extglob patterns are treated as globs', async t => {
	fs.mkdirSync(t.context.tmp);
	fs.writeFileSync(path.join(t.context.tmp, 'alpha.txt'), 'alpha');
	fs.writeFileSync(path.join(t.context.tmp, 'beta.txt'), 'beta');

	const destination = path.join(t.context.tmp, 'dest.txt');

	await execa('./cli.js', ['@(alpha|beta).txt', destination, '--cwd', t.context.tmp]);

	t.true(fs.statSync(destination).isDirectory());
	t.is(read(t.context.tmp, 'dest.txt/alpha.txt'), 'alpha');
	t.is(read(t.context.tmp, 'dest.txt/beta.txt'), 'beta');
});

test('single file to file copy with dotfiles', async t => {
	fs.mkdirSync(t.context.tmp);
	fs.writeFileSync(path.join(t.context.tmp, '.env.development'), 'DEV=true');

	await execa('./cli.js', [path.join(t.context.tmp, '.env.development'), path.join(t.context.tmp, '.env'), '--dot']);

	t.is(read(t.context.tmp, '.env'), 'DEV=true');
});

test('single file to directory when destination is existing directory', async t => {
	fs.mkdirSync(t.context.tmp);
	fs.mkdirSync(path.join(t.context.tmp, 'dest'));
	fs.writeFileSync(path.join(t.context.tmp, 'source.txt'), 'hello');

	await execa('./cli.js', [path.join(t.context.tmp, 'source.txt'), path.join(t.context.tmp, 'dest')]);

	t.is(read(t.context.tmp, 'dest/source.txt'), 'hello');
});

test('single file to directory when destination has trailing separator and does not exist', async t => {
	fs.mkdirSync(t.context.tmp);
	fs.writeFileSync(path.join(t.context.tmp, 'source.txt'), 'hello');

	const destination = path.join(t.context.tmp, 'newdir') + path.sep;

	await execa('./cli.js', [path.join(t.context.tmp, 'source.txt'), destination]);

	t.true(fs.statSync(path.join(t.context.tmp, 'newdir')).isDirectory());
	t.is(read(t.context.tmp, 'newdir/source.txt'), 'hello');
});

test('single file copy to ancestor directory avoids duplication', async t => {
	fs.mkdirSync(t.context.tmp);
	fs.mkdirSync(path.join(t.context.tmp, 'prisma'));
	fs.mkdirSync(path.join(t.context.tmp, 'prisma', 'parts'));
	fs.writeFileSync(path.join(t.context.tmp, 'prisma/parts/schema.prisma'), 'schema');

	await execa('./cli.js', [path.join(t.context.tmp, 'prisma/parts/schema.prisma'), path.join(t.context.tmp, 'prisma')]);

	t.is(read(t.context.tmp, 'prisma/schema.prisma'), 'schema');
	t.false(pathExistsSync(path.join(t.context.tmp, 'prisma/prisma/parts/schema.prisma')));
});
