var module = require('./_module_init.js');
module.factory('$QJLocalSession', [
	'$rootScope', '$http',
	function($rootScope, $http) {
		function save() {
			$http.defaults.headers.common['auth-token'] = $rootScope.session.token;
			store.set("qj_" + $rootScope.config.AppIdentifier + "_token", $rootScope.session.token);
			store.set("qj_" + $rootScope.config.AppIdentifier + "_session", $rootScope.session);
			session = $rootScope.session;
		}
		return {
			load: function() {
				return store.get("qj_" + $rootScope.config.AppIdentifier + "_session") || null;
			},
			add: function(cb) {
				$rootScope.session = store.get("qj_" + $rootScope.config.AppIdentifier + "_session") || null;
				cb($rootScope.session);
				save();
			},
			save: save
		}
	}
]);