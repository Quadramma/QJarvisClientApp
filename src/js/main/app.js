require('../../vendors/angular/angular');

require('../controllers/_module_init');

angular.element(document).ready(function() {

	var requires = [
		'app.controllers'
	];

	var app = angular.module('app', requires);

	angular.bootstrap(document, ['app']);

});
