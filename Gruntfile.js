module.exports = function(grunt) {
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),

    cssmin: {
      options: {
        banner: '/*! <%= pkg.name %> <%= grunt.template.today("isoDateTime") %> */\n'
      },
      dist: {
        files: {
          'output/app.css': ['css/*.css']
        }
      }
    },

    uglify: {
      options: {
        banner: '/*! <%= pkg.name %> <%= grunt.template.today("isoDateTime") %> */\n'
      },
      dist: {
        files: {
          'output/app.min.js': ['js/*.js']
        }
      }
    }

  });

  // Load the plugin that provides the "uglify" task.
  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-contrib-cssmin');

  // Default task(s).
  grunt.registerTask('default', ['uglify', 'cssmin']);
};
