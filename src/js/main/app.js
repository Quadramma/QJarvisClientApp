require('./AdminLTE/app');
require('./AdminLTE/dashboard');
require('./AdminLTE/demo');

require('../controllers/_module_init');
require('../services/_module_init');
require('../directives/_module_init');
require('../config/_module_init');
require('../controls/_module_init');

angular.element(document).ready(function() {

	var requires = [
		'ui.router',
		'ngResource',
		'app.config',
		'app.controllers',
		'app.services',
		'app.directives',
		'app.controls',
	];

	var app = angular.module('app', requires);

	app.config(['$httpProvider', '$sceDelegateProvider',
		function($httpProvider, $sceDelegateProvider) {
			$httpProvider.defaults.useXDomain = true;
			$sceDelegateProvider.resourceUrlWhitelist(['self', /^https?:\/\/(cdn\.)?quadramma.com/]);
			delete $httpProvider.defaults.headers.common['X-Requested-With'];
		}
	]);

	app.run([
		'$QJConfig',
		function($QJConfig) {
			//store.clear();
			$QJConfig.configure();
		}
	]);


	angular.bootstrap(document, ['app']);

});