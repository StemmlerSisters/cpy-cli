import path from 'node:path';
import fs from 'node:fs';
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

test('source file does not exist', async t => {
	await t.throwsAsync(execa('./cli.js', [path.join(t.context.tmp, 'nonexistentfile'), t.context.tmp]), {message: /nonexistentfile/});
});

test('cwd', async t => {
	fs.mkdirSync(t.context.tmp);
	fs.mkdirSync(path.join(t.context.tmp, 'cwd'));
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

test('single file copy to ancestor directory avoids duplication', async t => {
	fs.mkdirSync(t.context.tmp);
	fs.mkdirSync(path.join(t.context.tmp, 'prisma'));
	fs.mkdirSync(path.join(t.context.tmp, 'prisma', 'parts'));
	fs.writeFileSync(path.join(t.context.tmp, 'prisma/parts/schema.prisma'), 'schema');

	await execa('./cli.js', [path.join(t.context.tmp, 'prisma/parts/schema.prisma'), path.join(t.context.tmp, 'prisma')]);

	t.is(read(t.context.tmp, 'prisma/schema.prisma'), 'schema');
	t.false(pathExistsSync(path.join(t.context.tmp, 'prisma/prisma/parts/schema.prisma')));
});
