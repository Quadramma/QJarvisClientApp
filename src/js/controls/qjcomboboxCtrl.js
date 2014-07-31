var module = require('./_module_init.js');
module.factory('$QJCCombobox', [
	'$QJApi', '$QJHelperFunctions', '$QJLogger', '$rootScope', '$state', '$timeout', '$QJLocalSession', '$QJAuth',
	function($QJApi, $QJHelperFunctions, $QJLogger, $rootScope, $state, $timeout, $QJLocalSession, $QJAuth) {
		function seekObject(fullname, $scope, obj, index) {
			if (index == 0) {
				$QJLogger.log('QJCSelectkey -> seekObject -> something went wrong and i abort the recursive func bro!');
			}
			if (!_.isUndefined(obj) && _.isNull(obj)) {
				return obj;
			}
			if (fullname.toString().split('.').length == 1 || index == 0) {
				if (!_.isUndefined(obj)) {
					return obj[fullname] || null;
				} else {
					return $scope[fullname] || null;
				}

			} else {
				var firstPart = fullname.toString().split('.')[0];
				var rest = fullname.substring(firstPart.length + 1);
				//console.log("obj ->"+obj);
				//console.log("firstpart->"+firstPart);
				//console.log("rest->"+rest);
				return seekObject(rest, $scope, obj != null ? obj[firstPart] : $scope[firstPart], (_.isUndefined(index) ? 20 : index--));
			}
		};
		return {
			create: function(settings, $scope) {

				/*
				console.info('QJCCombobox ->  LOAD '
					+ ' CODE['+settings.code+']'
				);
*/

				settings.code_copyto = settings.code_copyto || null;
				settings.description_copyto = settings.description_copyto || null;


				var self = settings;

				self.initialValue = settings.code;
				self.selectedValue = self.selectedValue || -1;
				self.disabled = self.disabled || false;

				self.ngSelected = function(item) {
					return item._id == self.initialValue;
				};

				$scope[settings.name] = self; //sets to the scope !!!!

				if (typeof cbo == "undefined") {
					cbo = [];
				}
				cbo.push(self);

				$scope.$watch(settings.name + ".selectedValue", function(newVal, oldVal) {
					self.code = newVal;
					$scope.$emit(settings.name + '.change', {
						selectedValue: newVal
					});
				});
				$scope.$watch(settings.name + ".code", function(newVal, oldVal) {
					self.selectedValue = newVal;

					self.description = (_.find(self.items, function(item) {
						return item._id == newVal;
					}));
					self.description = self.description && self.description.description || "";

					$scope.$emit(settings.name + '.change', {
						selectedValue: newVal
					});
				});

				function copy(obj, fieldWord, val) {
					if (_.isUndefined(val)) {
						return;
					}
					if (val.toString() === '-1') {
						obj[fieldWord] = '';
					} else {
						obj[fieldWord] = val;
					}
				}

				function copyWhenPosible(fullpath, val) {
					if (_.isUndefined(fullpath) || _.isNull(fullpath) || fullpath.length == 0) {
						return; //omit!
					}
					var cuts = fullpath.toString().split('.');
					var fieldWord = cuts[cuts.length - 1];
					var pos = fullpath.toString().indexOf('.' + fieldWord);
					var path = fullpath.toString().substring(0, pos);
					//console.info("seeking for path obj on _>>>> "+path);
					var obj = seekObject(path, $scope);
					//console.info("founded "+JSON.stringify(obj));
					if (_.isUndefined(obj) || _.isNull(obj)) {
						console.info("copyWhenPosible failure for path -> " + fullpath);
						return; //omit!
					}
					copy(obj, fieldWord, val);
				}


				$scope.$watch(settings.name + '.code', function(newVal, oldVal) {
					copyWhenPosible(self.code_copyto, newVal);
				});
				copyWhenPosible(self.code_copyto, self.code || '');



				//set defaults
				$scope.$emit(settings.name + '.change', {
					selectedValue: self.code
				});

				if (self.description_copyto != null) {
					var cuts = self.description_copyto.toString().split('.');
					self.description_copyto_fieldWord = cuts[cuts.length - 1];
					var pos = self.description_copyto.toString().indexOf('.' + self.description_copyto_fieldWord);
					var path = self.description_copyto.toString().substring(0, pos);
					self.description_copyto_obj = seekObject(path, $scope);
					$scope.$watch(settings.name + '.description', function(newVal, oldVal) {
						copy(self.description_copyto_obj, self.description_copyto_fieldWord, newVal);
					});
					copy(self.description_copyto_obj, self.description_copyto_fieldWord, self.description || '');
					$scope.$emit(settings.name + '.description', {
						description: self.description
					});
				}


				self.update = function() {
					$QJApi.getController(settings.api.controller).get(settings.api.params, function(res) {
						//$QJLogger.log("QJCCombobox -> "+settings.name+" -> " + settings.api.controller + "  " + settings.api.params.action + " ("+JSON.stringify(settings.api.params)+") -> success");
						self.items = res.items;
						self.selectedValue = self.initialValue;
						//console.info(res.req);
					});
				};
				self.update(); //initial

				//watch for params change to update
				$scope.$watch(settings.name + '.api.params', function(newVal, oldVal) {
					self.update();
					//$QJLogger.log("QJCCombobox -> " + settings.name + " -> params changes -> updating..");
				}, true);


			}
		};
	}
]);
module.directive('qjccombobox', function($rootScope) {
	var directive = {};
	directive.restrict = 'E'; /* restrict this directive to elements */
	directive.templateUrl = "pages/controls/qjccombobox.html";
	directive.scope = {
		cbo: '='
	};
	directive.compile = function(element, attributes) {
		var linkFunction = function($scope, element, attributes) {}
		return linkFunction;
	}
	return directive;
});