var module = require('./_module_init.js');
module.factory('$QJLogger', [
	'$rootScope', '$state', '$timeout',
	function($rootScope, $state, $timeout) {
		return {
			log: function(msg) {
				var appName = $rootScope.config.appName;
				console.info('[' + appName + '][' + msg + ']');
			}
		}
	}
]);