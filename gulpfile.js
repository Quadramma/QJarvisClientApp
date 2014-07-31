'use strict';

// dependencies
var gulp = require('gulp');
var clean = require('gulp-clean');
var gutil = require('gulp-util');
var concat = require('gulp-concat');
var browserify = require('gulp-browserify');
var uglify = require('gulp-uglify');
var rename = require('gulp-rename');
var filesize = require('gulp-filesize');
var changed = require('gulp-changed');
var watch = require('gulp-watch');
//var ngmin = require('gulp-ngmin'); 

var isProduction = false;

//clean
gulp.task('clean', function() {
  return gulp.src('build', {
      read: false
    })
    .pipe(clean());
});

// scripts task
gulp.task('js', function() {
  return gulp.src('src/js/main/app.js')
    .pipe(browserify({
      insertGlobals: true,
      debug: !isProduction
    }))
    .pipe(gulp.dest('build'))
    .pipe(filesize())
});
gulp.task('jsminify', function() {
  return gulp.src('src/js/main/app.js')
    .pipe(browserify({
      insertGlobals: true,
      debug: !isProduction
    }))
    .pipe(uglify())
    .pipe(rename('app.min.js'))
    .pipe(gulp.dest('build'))
    .pipe(filesize())
    
});

gulp.task('jss:watch', function() {
  watch({
    glob: 'src/js/**/*.js',
    emit: 'one',
    emitOnGlob: false
  }, function(files) {
    return gulp.src('src/js/main/app.js')
      .pipe(browserify({
        insertGlobals: true,
        debug: !isProduction
      }))
      .pipe(concat('app.js'))
      //.pipe(changed('build'))
      .pipe(gulp.dest('build'))
      .pipe(filesize())
      /*
      .pipe(uglify())
      .pipe(rename('app.min.js'))
      .pipe(gulp.dest('build'))
      .pipe(filesize())
      */
  });
});

gulp.task('css:watch', function() {
  watch({
    glob: 'src/css/**/*.css',
    emit: 'one',
    emitOnGlob: false
  }, function(files) {
    return files
      .pipe(concat('app.css'))
      //.pipe(changed('build'))
      .pipe(gulp.dest('build'))
      .pipe(filesize())
      //.pipe(uglify())
      //.pipe(rename('app.min.css'))
      //.pipe(gulp.dest('build'))
      //.pipe(filesize())
  });
});

gulp.task('css', function() {
  return gulp.src('src/css/**/*.css')
    .pipe(concat('app.css'))
    //.pipe(changed('build'))
    .pipe(gulp.dest('build'))
    .pipe(filesize())
    //.pipe(uglify())
    //.pipe(rename('app.min.css'))
    //.pipe(gulp.dest('build'))
    //.pipe(filesize())
});
gulp.task('cssminify', function() {
  return gulp.src('src/css/**/*.css')
    .pipe(concat('app.css'))
    .pipe(uglify())
    .pipe(rename('app.min.css'))
    .pipe(gulp.dest('build'))
    .pipe(filesize())
});

gulp.task('html:watch', function() {
  watch({
    glob: 'src/**/*.html',
    emit: 'one',
    emitOnGlob: false
  }, function(files) {
    return files
      //.pipe(changed('build'))
      .pipe(gulp.dest('build'))
      .pipe(filesize())
  });
});

gulp.task('html', function() {
  return gulp.src('src/**/*.html')
    //.pipe(changed('build'))
    .pipe(gulp.dest('build'))
    .pipe(filesize())
});

//external libraries

gulp.task('vendor', function() {
  return gulp.src('vendor/*.js')
    //.pipe(changed('build'))
    .pipe(concat('vendor.js'))
    .pipe(gulp.dest('build'))
    .pipe(filesize())
    /*
    .pipe(uglify())
    .pipe(rename('vendor.min.js'))
    //.pipe(changed('build'))
    .pipe(gulp.dest('build'))
    .pipe(filesize())
    */
    .on('error', gutil.log)
});

gulp.task('default', [
  //'clean',
  //'html',
  'css',
  'js',
  //'jsminify',
  //'cssminify',
  //'html:watch',
  'css:watch',
  'jss:watch',
  'vendor'
]);