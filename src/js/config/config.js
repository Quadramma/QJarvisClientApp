var module = require('./_module_init.js');


module.config(['$httpProvider', '$sceDelegateProvider',
	function($httpProvider, $sceDelegateProvider) {
		$httpProvider.defaults.useXDomain = true;
		$sceDelegateProvider.resourceUrlWhitelist(['self', /^https?:\/\/(cdn\.)?quadramma.com/]);
		delete $httpProvider.defaults.headers.common['X-Requested-With'];
	}
]);


module.run([
	'$QJConfig',
	function($QJConfig) {
		//store.clear();
		$QJConfig.configure();
	}
]);