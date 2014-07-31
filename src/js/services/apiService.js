var module = require('./_module_init.js');
module.factory('$QJApi', ['$QJTime', '$QJLocalSession', '$QJLogger', "$QJConfig", "$resource", '$QJErrorHandler', '$rootScope',
	function($QJTime, $QJLocalSession, $QJLogger, $QJConfig, $resource, $QJErrorHandler, $rootScope) {
		var rta = new(function() {

			//api in root
			if (_.isUndefined($rootScope.api)) {
				var _apiInfo = {
					status: 'Waiting',
					calls: [],
					calls_working: 0,
					calls_finished: 0,
					callsInProgress: function() {
						var asd = (_.filter(_apiInfo.calls, function(call) {
							return call.ended = true;
						})).length();

						return 0;
					},
					start: function(info) {
						var call = {
							info: info,
							ended: false,
							startTime: (new Date()).getTime(),
							endTime: null,
							duration: null
						};
						_apiInfo.calls_working += 1;
						_apiInfo.status = 'Working';
						_apiInfo.calls.push(call);
						return { //represents the call
							end: function() {
								call.ended = true;
								call.endTime = (new Date()).getTime();
								call.duration = (call.startTime - call.endTime) / 100; //dur in secs.
								_apiInfo.calls_working -= 1;
								_apiInfo.calls_finished += 1;
								if (_apiInfo.calls_working == 0) {
									_apiInfo.status = 'Waiting';
								}
							}
						};
					},
					buildCacheItemId: function(ctrlName, params, postData) {
						var concat = ctrlName;
						for (var x in params) {
							var param = params[x];
							concat += param;
						}
						for (var x in postData) {
							var data = postData[x];
							concat += data;
						}
						return concat;
					},
					newCacheItemFunct: function(cacheItem) {
						cacheItem.setRes = function(res) {
							var self = this;
							$QJLocalSession.add(function(session) {
								session.httpcache[self.index].res = res;
							});
						};
						cacheItem.hasRes = function() {
							return this.res != null;
						};
						return cacheItem;
					},
					newCacheItem: function(params) {
						var rta = {
							id: params.id,
							index: params.index,
							params: {},
							postData: {},
							res: null,
							expiration: (new Date()).getTime(),
							expirein: $QJTime.getTimestampDuration(
								$rootScope.config.cache_expiration_minutes / 1000
							)
						};
						rta = this.newCacheItemFunct(rta);
						return rta;
					},
					getCache: function(ctrlName, params, postData) {
						var self = this;
						var id = this.buildCacheItemId(ctrlName, params, postData);

						if (!_.isUndefined(params.ignorecache) && params.ignorecache == true) {
							return {
								hasRes: function() {
									return false;
								},
								setRes: function() {}
							}
						}

						if (!$rootScope.session.httpcache) $rootScope.session.httpcache = [];
						//tryget
						var rtacache = null;
						for (var x in $rootScope.session.httpcache) {
							var item = $rootScope.session.httpcache[x];
							if (item.id == id) {
								rtacache = item;

								var diff =
									(rtacache.expiration + ((parseInt($rootScope.config.cache_expiration_minutes) * 60) * 1000)) -
									(new Date()).getTime();
								if (diff < 0) {
									rtacache = null;
									$rootScope.session.httpcache.splice(x, 1);
								} else {

									rtacache.expirein =
										$QJTime.getTimestampDuration(diff);
								}
								break;
							}
						}
						if (_.isUndefined(rtacache) || _.isNull(rtacache)) {
							var newItem = self.newCacheItem({
								id: id,
								index: $rootScope.session.httpcache.length
							});
							$rootScope.session.httpcache.push({
								id: newItem.id,
								index: newItem.index,
								params: newItem.params,
								postData: newItem.postData,
								res: newItem.res,
								expiration: newItem.expiration,
								expiration_seconds: newItem.expiration_seconds
							});
							$QJLocalSession.save();
							return newItem;
						} else {
							rtacache = self.newCacheItemFunct(rtacache);
							return rtacache;
						}
					}
				};

				/*
				var call = _apiInfo.start({
					description: 'Test task for api'
				});
				call.end();
				*/

				$rootScope.api = _apiInfo;
				gapi = $rootScope.api;
			}



			//--CLASS DEF
			var self = this;

			//PRIVATEE
			function hasReportedErrors(res, ignoreBadRequest) {
				if (res && _.isUndefined(res.ok)) {
					//console.log(res);
					$QJErrorHandler.handle($QJErrorHandler.codes.API_INVALID_RESPONSE, res);
					return true;
				}
				if (res && !_.isUndefined(res.ok) && res.ok == false && !ignoreBadRequest) {

					if (res && !_.isUndefined(res.errorcode)) {
						$QJLogger.log('api warning -> handling errorcode ' + res.errorcode);
						$QJErrorHandler.handle(res.errorcode, res);
						return true;
					} else {
						$QJErrorHandler.handle($QJErrorHandler.API_RESPONSE_HAS_ERRORS_WITHOUT_ERRORCODE, res);
						return true;
					}

					$QJErrorHandler.handle($QJErrorHandler.codes.API_RESPONSE_HAS_ERRORS, res);
					return true;
				}
				return false;
			}

			function getController(controllerName, ignoreBadRequest) {
				var $res = $resource($rootScope.config.api + '/:controller/:action/:id', {}, {
					query: {
						method: "GET",
						isArray: true
					},
					get: {
						method: "GET",
						isArray: false,
						params: {
							controller: controllerName
						}
					},
					request: {
						method: 'POST',
						isArray: false,
						params: {
							controller: controllerName
						}
					},
					save: {
						method: 'POST',
						isArray: false
					},
					update: {
						method: 'POST',
						isArray: false
					},
					delete: {
						method: "DELETE",
						isArray: false
					}
				});
				var controller = {};
				controller.hasReportedErrors = hasReportedErrors;
				controller.post = function(params, postData, success) {

					var cache = $rootScope.api.getCache(controllerName, params, postData);
					if (cache.hasRes()) {
						if (!hasReportedErrors(cache.res, ignoreBadRequest)) {
							success(cache.res);
						}
						return;
					}

					var call = $rootScope.api.start(params);

					if (params && params.ignorecache) {
						delete(params.ignorecache);
					}

					$res.request(params, postData, function(res) {
						call.end();
						if (!hasReportedErrors(res, ignoreBadRequest)) {
							success(res);
							cache.setRes(res);
						}
					}, function() {
						call.end();
						$QJErrorHandler.handle($QJErrorHandler.codes.API_ERROR);
					});
				}
				controller.get = function(params, success) {
					var cache = $rootScope.api.getCache(controllerName, params, {});
					if (cache.hasRes()) {
						if (!hasReportedErrors(cache.res, ignoreBadRequest)) {
							success(cache.res);
						}
						return;
					}

					var call = $rootScope.api.start(params);

					if (params && params.ignorecache) {
						delete(params.ignorecache);
					}

					$res.get(params, function(res) {
						call.end();
						if (!hasReportedErrors(res, ignoreBadRequest)) {
							success(res);
							cache.setRes(res);
						}
					}, function(res) {
						call.end();
						if (res && !_.isUndefined(res.status) && res.status == 500) {
							$QJErrorHandler.handle($QJErrorHandler.codes.API_INTERNAL_SERVER_ERROR);
							return;
						}

						$QJErrorHandler.handle($QJErrorHandler.codes.API_ERROR);
					});
				};

				return controller;
			}

			//PUBLIC --------------------------------------
			self.getController = function(controllerName) {
				return getController(controllerName, false);
			};
			self.getLoginController = function(controllerName) {
				console.info("login controller return");
				return getController(controllerName, true);
			};
			self.isOK = function(success, failure) {
				//Check api status
				var Test = self.getController("test");
				Test.get({
					action: "status"
				}, function(res) {
					if (res && !_.isUndefined(res.ok) && res.ok == true) {
						success();
					} else {
						failure();
					}
				})
			};
			return self;
			//--CLASS DEF
		})();
		return rta; //factory return
	}
]);