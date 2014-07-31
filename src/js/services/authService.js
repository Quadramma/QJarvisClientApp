var module = require('./_module_init.js');
module.factory('$QJAuth', ['$QJLogger', "$rootScope", "$http", '$QJLocalSession',
	function($QJLogger, $rootScope, $http, $QJLocalSession) {
		return {
			updateSessionCustom: function(token, _group_id) {
				$rootScope.session.token = token;
				$rootScope.session._group_id = _group_id;
				$rootScope.config._group_id = _group_id;
				$QJLocalSession.save();
				$rootScope.$emit('session.change');
				$QJLogger.log('QJAuth -> updateSessionCustom -> token ->' + token);
			},
			updateSessionFromLogin: function(res) {
				$rootScope.session.loginname = res.loginname;
				$rootScope.session.token = res.token;
				$rootScope.session.tokenReq = res.tokenReq;
				$rootScope.session.tokenExp = res.tokenExp;
				$rootScope.session._group_id = $rootScope.config._group_id;
				$QJLocalSession.save();
				$rootScope.$emit('session.change');
				$QJLogger.log('QJAuth -> updateSessionFromLogin -> token ->' + res.token);

			}
		}
	}
]);