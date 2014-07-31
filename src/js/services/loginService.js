var module = require('./_module_init.js');
module.factory('$QJLoginModule', [

	'$QJLogger', '$QJAuth', "$QJConfig", "$QJApi", "$resource", "$rootScope", '$QJLocalSession',
	function($QJLogger, $QJAuth, $QJConfig, $QJApi, $resource, $rootScope, $QJLocalSession) {
		var rta = new(function() {
			//--CLASS DEF
			var self = this;
			//
			self.login = function(loginname, password, success, failure) {
				var reqData = {
					"loginname": loginname,
					"password": password,
					"tokenReq": new Date().getTime(),
					'_group_id': $rootScope.config._group_id,
				};
				$QJLogger.log('QJLoginModule -> reqData');
				//console.info(reqData);
				var Auth = $QJApi.getController("auth");
				Auth.post({
					action: "login"
				}, reqData, function(res) {
					$QJLogger.log('QJLogin -> success');
					$QJAuth.updateSessionFromLogin(res);
					success();
				});
			};
			return self;
			//--CLASS DEF
		})();
		return rta; //factory return
	}
]);