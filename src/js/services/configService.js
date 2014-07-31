var module = require('./_module_init.js');
module.factory('$QJConfig', ['$QJLogger', '$rootScope', '$state', '$timeout', '$QJLocalSession', '$QJAuth',
	function($QJLogger, $rootScope, $state, $timeout, $QJLocalSession, $QJAuth) {
		var self = {
			appName: 'QJ',
			AppIdentifier: "AppIdentifier_NAME",
			//api: "http://localhost/qjarvis/api", //SIN '/' AL FINAL
			//api: "http://www.quadramma.com/pruebas/qjarvis/api", //SIN '/' AL FINAL  
			api: (location.origin + location.pathname).toString().replace("admin", "api").substring(0, (location.origin + location.pathname).toString().replace("admin", "api").length - 1), //API IN SAME PLACE (admin,api) //SIN '/' AL FINAL
			facebookAppID: "815991785078819",
			_group_id: 2, //DEFAULT QJARVIS BACKEND (2)
			listviewEntriesPerPage: 5,
			htmlTitle: "QJarvis | Dashboard"
		};
		return {
			configure: function() {


				$.getJSON("config.json", function(data) {
					console.info('[CONFIG.JSON][OK]');
					self.api = data.api;
				});


				$rootScope.config = self;
				var localstoreSessionData = $QJLocalSession.load();
				session = localstoreSessionData;

				if ((session && session._group_id)) {
					session.config = self;
				}
				//
				self._group_id = (session && session._group_id) ? session._group_id : self._group_id; //updates config with session _group_id
				if (localstoreSessionData) {
					$rootScope.session = localstoreSessionData;
					$QJLocalSession.save();
					$QJLogger.log('QJConfig-> configure-> session initialized from localstore');
				} else {
					$QJLogger.log('QJConfig-> configure-> session initialized from zero');
					$rootScope.session = {
						loginname: "",
						token: null,
						tokenReq: null,
						tokenExp: null,
					};
				}
				//
				$rootScope.htmlTitle = $rootScope.config.htmlTitle;
				//
				$QJLogger.log('QJConfig-> configure-> success');
				//


				if (!$rootScope.session || ($rootScope.session && _.isUndefined($rootScope.session.tokenExp))) {
					$QJLogger.log('QJHelper -> Token -> not avaliable');
					$timeout(function() {
						$state.go('login', null);
					}, 0);
					return;
				}
				if ($rootScope.session && $rootScope.session.tokenExp == null) {
					$QJLogger.log('QJHelper -> Token -> not avaliable');
					$timeout(function() {
						$state.go('login', null);
					}, 0);
					return;
				}
				var milliNow = new Date().getTime();
				var milliDiff = milliNow - parseInt($rootScope.session.tokenExp);
				var expirationSeconds = (Math.abs(milliDiff) / 1000);

				if (milliDiff > 0) {
					$timeout(function() {
						$state.go('login', null);
					}, 0);
					$QJLogger.log('QJHelper -> Token -> expired');
				} else {
					$QJLogger.log('QJHelper -> Token -> expires in ' + expirationSeconds + ' seconds');
				}


			}
		};

	}
]);