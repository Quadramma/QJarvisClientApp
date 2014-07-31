var module = require('./_module_init.js');
module.factory('$QJLocalSession', [
	'$rootScope', '$http',
	function($rootScope, $http) {
		return {
			load: function() {
				return store.get("qj_" + $rootScope.config.AppIdentifier + "_session") || null;
			},
			save: function() {
				$http.defaults.headers.common['auth-token'] = $rootScope.session.token;
				store.set("qj_" + $rootScope.config.AppIdentifier + "_token", $rootScope.session.token);
				store.set("qj_" + $rootScope.config.AppIdentifier + "_session", $rootScope.session);
				session = $rootScope.session;
			}
		}
	}
]);