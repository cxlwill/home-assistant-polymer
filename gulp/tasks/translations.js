const path = require('path');
const gulp = require('gulp');
const foreach = require('gulp-foreach');
const hash = require('gulp-hash');
const insert = require('gulp-insert');
const merge = require('gulp-merge-json');
const minify = require('gulp-jsonminify');
const rename = require('gulp-rename');
const transform = require('gulp-json-transform');

const inDir = 'translations'
const outDir = 'build/translations';

const tasks = [];

function recursive_flatten (prefix, data) {
  var output = {};
  Object.keys(data).forEach(function (key) {
    if (typeof(data[key]) === 'object') {
      output = Object.assign({}, output, recursive_flatten(key + '.', data[key]));
    } else {
      output[prefix + key] = data[key];
    }
  });
  return output
}

function flatten (data) {
  return recursive_flatten('', data);
}

var taskName = 'build-merged-translations';
gulp.task(taskName, function () {
  return gulp.src(inDir + '/*.json')
    .pipe(foreach(function(stream, file) {
      // For each language generate a merged json file. It begins with en.json as
      // a failsafe for untranslated strings, and merges all parent tags into one
      // file for each specific subtag
      const tr = path.basename(file.history[0], '.json');
      const subtags = tr.split('-');
      const src = [inDir + '/en.json']; // Start with en as a fallback for missing translations
      for (i = 1; i <= subtags.length; i++) {
        const lang = subtags.slice(0, i).join('-');
        src.push(inDir + '/' + lang + '.json');
      }
      return gulp.src(src)
        .pipe(transform(function(data, file) {
          // Polymer.AppLocalizeBehavior requires flattened json
          return flatten(data);
        }))
        .pipe(transform(function(data, file) {
          const new_data = {};
          Object.entries(data).forEach(([key, value]) => {
            // Filter out empty strings or other falsey values before merging
            if (data[key]) new_data[key] = value;
          });
          return new_data;
        }))
        .pipe(merge({
          fileName: tr + '.json',
        }))
        .pipe(minify())
        .pipe(gulp.dest(outDir));
    }));
});
tasks.push(taskName);

var taskName = 'build-translation-fingerprints';
gulp.task(taskName, ['build-merged-translations'], function() {
  return gulp.src(outDir + '/*.json')
    .pipe(rename({
      extname: "",
    }))
    .pipe(hash({
      algorithm: 'md5',
      hashLength: 32,
      template: '<%= name %>-<%= hash %>.json',
    }))
    .pipe(hash.manifest('translationFingerprints.json'))
    .pipe(transform(function(data, file) {
      Object.keys(data).map(function(key, index) {
        data[key] = {fingerprint: data[key]};
      });
      return data;
    }))
    .pipe(gulp.dest('build-temp'));
});
tasks.push(taskName);

var taskName = 'build-translations';
gulp.task(taskName, ['build-translation-fingerprints'], function() {
  return gulp.src([
      'src/translations/translationMetadata.json',
      'build-temp/translationFingerprints.json',
    ])
    .pipe(merge({}))
    .pipe(transform(function(data, file) {
      const new_data = {};
      Object.entries(data).forEach(([key, value]) => {
        // Filter out empty strings or other falsey values before merging
        if (data[key]['nativeName']) {
          new_data[key] = data[key];
        } else {
            console.warn(`Skipping language ${key}. Native name was not translated.`);
        }
        if (data[key]) new_data[key] = value;
      });
      return new_data;
    }))
    .pipe(insert.wrap('<script>\nwindow.translationMetadata = ', ';\n</script>'))
    .pipe(rename('translationMetadata.html'))
    .pipe(gulp.dest('build-temp'));
});
tasks.push(taskName);

module.exports = tasks;
