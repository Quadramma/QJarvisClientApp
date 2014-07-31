var module = require('./_module_init.js');
module.factory('$QJHelperFunctions', [
	'$QJLogger', '$QJApi', '$rootScope', '$state', '$timeout', '$QJErrorHandler',
	function($QJLogger, $QJApi, $rootScope, $state, $timeout, $QJErrorHandler) {
		var self = {};
		self.changeState = function(stateName, params, timeout) {
			$timeout(function() {
				$QJLogger.log('QJHelper -> State -> going to ' + stateName + '  | Current -> ' + $state.current.name);
				$state.go(stateName, params);
			}, timeout || 0);
		};
		self.checkTokenExpirationAndGoToLoginStateIfHasExpired = function() {
			if (!$rootScope.session || ($rootScope.session && _.isUndefined($rootScope.session.tokenExp))) {
				$QJLogger.log('QJHelper -> Token -> not avaliable');
				self.changeState('login');
				return;
			}
			if ($rootScope.session && $rootScope.session.tokenExp == null) {
				$QJLogger.log('QJHelper -> Token -> not avaliable');
				self.changeState('login');
				return;
			}
			var milliNow = new Date().getTime();
			var milliDiff = milliNow - parseInt($rootScope.session.tokenExp);
			var expirationSeconds = (Math.abs(milliDiff) / 1000);

			if (milliDiff > 0) {
				//Si es positivo significa que el tiempo actual es mayor al de exp, por lo que el token expiro.
				self.changeState('login');
				$QJLogger.log('QJHelper -> Token -> expired');
			} else {
				$QJLogger.log('QJHelper -> Token -> expires in ' + expirationSeconds + ' seconds');
			}
		};

		self.getTimestampDuration = function(timestamp) {
			var duration = {
				hours: Math.round(Math.floor(timestamp / 1000 / 60 / 60) % 24),
				minutes: Math.round(Math.floor(timestamp / 1000 / 60) % 60),
				seconds: Math.round(Math.floor(timestamp / 1000) % 60)
			};
			var str = "";
			str += duration.hours + ":";
			str += duration.minutes + ":";
			str += duration.seconds + "";
			return str;
		};



		/*
		self.checkAPIAndGoToApiErrorStateIfThereIsAProblem = function() {
			$QJApi.isOK(function() {
				$QJLogger.log('QJHelper -> API -> working');
			}, function() {
				$QJLogger.log('QJHelper -> API -> not avaliable');
				$QJErrorHandler.handle($QJErrorHandler.codes.API_TIMEOUT);
			});
		};
		*/
		return self;
	}
]);