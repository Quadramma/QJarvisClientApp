var module = require('./_module_init.js');
module.factory('$QJCTimeCounter', [
	'$interval', '$QJApi', '$QJHelperFunctions', '$QJLogger', '$rootScope', '$state', '$timeout', '$QJLocalSession', '$QJAuth',
	function($interval, $QJApi, $QJHelperFunctions, $QJLogger, $rootScope, $state, $timeout, $QJLocalSession, $QJAuth) {
		return {
			create: function(settings, $scope) {
				var self = _.extend(settings, {
					working: false,
					project: "none",
					startTimeFormated: null,
					endTimeFormated: null,
					errors: [],
					callingApi: false
				});
				self.addError = function(error) {
					self.errors.push(error);
					$timeout(function() {
						$scope.$apply(function() {
							self.errors = [];
						});
					}, 2000);
				};
				self.restart = function() {
					self.startTimeFormated = null;
					self.endTimeFormated = null;
					self.errors = [];
					self.diffFormated = null;
				};
				self.init = function() {
					if (self.callingApi) return; //calling apy sync please.
					self.restart();
					self.callingApi = true;
					$QJApi.getController(settings.api.controller).get(settings.api.params, function(res) {
						self.callingApi = false;
						$QJLogger.log("QJCTimeCounter -> " + JSON.stringify(settings.api) + " -> success");
						self.working = (res.item != null);
						self.resitem = res.item;
						if (!_.isUndefined(settings.onInit)) {
							settings.onInit(self);
						}
					});
					return self;
				};
				self.getTime = function() {
					return new Date().getTime();
				};
				self.getTimeFormated = function() {
					return moment(self.getTime()).format("dddd, MMMM Do YYYY, h:mm:ss a");
				};
				self.getDiff = function(milli) {
					var actual = self.getTime();
					return (actual - milli);
				};
				self.getDiffFormated = function(milli) {
					var diff = self.getDiff(milli);
					var duration = {
						hours: Math.round((diff / 1000 / 60 / 60) % 24),
						minutes: Math.round((diff / 1000 / 60) % 60),
						seconds: Math.round((diff / 1000) % 60)
					};
					var str = "";
					str += duration.hours + " hours, ";
					str += duration.minutes + " mins, ";
					str += duration.seconds + " secs, ";
					//str += diff + " total, ";
					return str;
				};
				self.validateStart = function() {
					if (!_.isUndefined(settings.onValidateStart)) {
						return settings.onValidateStart(self);
					} else {
						return true;
					}
				};
				self.resume = function(from) {
					self.start(from);
				};
				self.start = function(start) {
					if (!self.validateStart()) {
						return;
					} else {
						//console.info("TIMER STARTED FAIL");
					}

					//
					//console.info("TIMER STARTED");

					if (start && start.length > 0) {
						self._startVal = parseInt(start);
					} else {
						self._startVal = self.getTime(); //start setted	
					}

					if (!_.isUndefined(settings.onStartChange)) {
						settings.onStartChange(self._startVal, self);
					}
					self.startTimeFormated = self.getTimeFormated(); //start formated setted
					self.endTimeFormated = self.startTimeFormated; //end setted
					self.diff = self.getDiff(self._startVal);
					self.diffFormated = self.getDiffFormated(self._startVal);
					if (!_.isUndefined(settings.onDiffChange)) {
						settings.onDiffChange(self.diff, self.diffFormated, self);
					}
					self.workingInterval = $interval(function() {
						if (!self.working) return;
						self._stopVal = self.getTime();
						if (!_.isUndefined(settings.onStopChange)) {
							settings.onStopChange(self._stopVal, self);
						}
						self.endTimeFormated = self.getTimeFormated();
						self.diff = self.getDiff(self._startVal);
						self.diffFormated = self.getDiffFormated(self._startVal);
						if (!_.isUndefined(settings.onDiffChange)) {
							settings.onDiffChange(self.diff, self.diffFormated, self);
						}
					}, 1000);
					self.working = true;
					if (!_.isUndefined(settings.onStartClick)) {
						settings.onStartClick(self);
					}
				};
				self.stop = function() {
					self.working = false;
					$interval.cancel(self.workingInterval);
					if (!_.isUndefined(settings.onStopClick)) {
						settings.onStopClick(self);
					}
				};
				$scope[settings.name] = self;
				return self;
			}
		};
	}
]);